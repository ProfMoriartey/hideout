import { expect, sceneReady, test } from './support/fixtures';
import { startPagesServer } from './support/pages-server';

// Ticket 1: the build works when served the way GitHub Pages serves it.
let pages: Awaited<ReturnType<typeof startPagesServer>>;
test.beforeAll(async () => {
  pages = await startPagesServer();
});
test.afterAll(async () => {
  await pages.close();
});

test('every request the app makes stays under /hideout/', async ({ page }) => {
  const outside: string[] = [];
  const failed: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.origin === pages.origin && !url.pathname.startsWith('/hideout/')) {
      outside.push(url.pathname);
    }
  });
  page.on('response', (res) => {
    if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
  });
  await page.goto(`${pages.origin}/hideout/`);
  await sceneReady(page);
  expect(outside).toEqual([]);
  expect(failed).toEqual([]);
});

test('/hideout without the slash redirects and loads', async ({ page }) => {
  await page.goto(`${pages.origin}/hideout`);
  await expect(page).toHaveURL(`${pages.origin}/hideout/`);
  await sceneReady(page);
});

test('an unknown deep link falls back to the app via 404.html', async ({ page, consoleErrors }) => {
  // The document itself is a 404 (that is how Pages serves the fallback).
  consoleErrors.allow(/status of 404/);
  const res = await page.goto(`${pages.origin}/hideout/rooms/feitan?demo=1`);
  expect(res?.status()).toBe(404);
  await expect(page).toHaveTitle('The Hideout');
  await sceneReady(page);
  await expect(page.locator('canvas')).toBeVisible();
});

test('declares a favicon that exists under /hideout/', async ({ page, request }) => {
  // Without one, browsers ask for /favicon.ico at the site root, which is
  // outside the Pages project and 404s with a console error.
  await page.goto(`${pages.origin}/hideout/`);
  const icon = page.locator('link[rel~="icon"]');
  await expect(icon, 'a <link rel="icon"> in index.html').toHaveCount(1);
  const href = await icon.evaluate((el: HTMLLinkElement) => el.href);
  expect(new URL(href).pathname).toMatch(/^\/hideout\//);
  expect((await request.get(href)).status()).toBe(200);
});
