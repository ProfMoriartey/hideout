# The Hideout

A live, voxel-3D status page: a spider hideout carved into dark rock where each
member has a room that lights up while they are at work and sleeps when they
are not. Built with Vite, React 18, TypeScript, three.js, React Three Fiber and
drei. Phone first.

Live: https://profmoriartey.github.io/hideout/

Architecture, feed contract and performance budget: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Develop

Requires Node 22+.

```sh
npm ci            # install exact locked versions
npm run dev       # dev server at http://localhost:5173/hideout/
npm run build     # typecheck + production build into dist/
npm run preview   # serve dist/ at http://localhost:4173/hideout/
npm run lint      # ESLint + Prettier check (npm run format to fix)
npm run typecheck # tsc, no output
npm test          # unit tests (Vitest, jsdom)
npm run e2e       # Playwright smoke tests on desktop + phone (build first)
```

### End-to-end tests

`npm run e2e` serves the production build with `vite preview`, so run
`npm run build` first. Two projects run: `desktop` (Chromium 1280x800) and
`phone` (Pixel 7). Screenshots land in `e2e/screenshots/` (not committed).

Browser: install it once with `npx playwright install chromium`. If a matching
Chromium is already on the machine elsewhere, point to it instead:

```sh
PW_CHROMIUM=/opt/pw-browsers/chromium npm run e2e
```
