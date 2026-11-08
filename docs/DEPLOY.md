# Deploying the Hideout

The site is a static Vite build (`base: '/hideout/'`, output `dist/`) served by
GitHub Pages at `https://profmoriartey.github.io/hideout/`. Everything runs in
GitHub Actions; no secrets or tokens are needed.

## One-time setup (repository owner)

1. Open the `hideout` repository on GitHub: **Settings -> Pages**.
2. Under **Build and deployment -> Source**, choose **GitHub Actions**.
3. Merge to `main`. The first push to `main` after this deploys the site.

Until Pages is enabled with the "GitHub Actions" source, the deploy job fails at
the configure/deploy step; nothing else is affected.

## Workflows

### `.github/workflows/ci.yml` (checks)

Runs on every pull request and on every push to a branch other than `main`:

1. Node 22 via `actions/setup-node` with the npm cache, then `npm ci`.
2. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, then
   `npm run size` (bundle size budget).
3. `npx playwright install --with-deps chromium`, then
   `npm run e2e` (desktop and phone projects; the script turns tracing off).
4. Artifacts: `e2e-screenshots` (`e2e/screenshots/`, always uploaded) and
   `playwright-report` (`playwright-report/`, only when a step failed). Kept 14 days.

CI runs once per commit: runs share a concurrency group keyed on the branch
(`github.head_ref || github.ref_name`), so the push run and the pull request run
for the same commit do not both finish, and a newer commit cancels an older run.

### `.github/workflows/deploy.yml` (Pages)

Runs on push to `main` and manually via **Actions -> Deploy to GitHub Pages ->
Run workflow** (`workflow_dispatch`).

- **build** job: `npm ci`, `npm run build`, then `cp dist/index.html dist/404.html`
  so unknown paths under `/hideout/` still load the app, then
  `actions/configure-pages` and `actions/upload-pages-artifact` (path `dist`).
- **deploy** job: `actions/deploy-pages` into the `github-pages` environment; the
  environment shows the live URL. Only this job gets `pages: write` and
  `id-token: write`; every workflow defaults to `contents: read`.
- Concurrency group `pages` with `cancel-in-progress: false`: deploys queue up
  and never cut each other off halfway.

The deploy workflow does not re-run the test suite; `main` only receives code
that already passed CI on its branch or pull request.

## Rollback

Pages always serves the last successful deployment. To roll back, revert the bad
commit on `main` (`git revert <sha>`, then merge) and the deploy runs again. For
an immediate fix without a new commit, open an earlier successful run of
"Deploy to GitHub Pages" and use **Re-run all jobs**; it rebuilds from that run's
commit.

## Checking a deploy

- **Actions** tab: both jobs green; the deploy job links the page URL.
- Open `https://profmoriartey.github.io/hideout/` and `?demo=1`; rooms should
  animate with the demo feed.
- **Settings -> Environments -> github-pages** lists the deployment history.
