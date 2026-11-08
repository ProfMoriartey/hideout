import { test as base, expect } from '@playwright/test';

// Collects console errors and uncaught page errors for every test and fails
// the test if any were seen. Tests that expect errors (WebGL off, chunk
// failure) call `consoleErrors.allow(pattern)` first.
type ConsoleErrors = { list: string[]; allow: (pattern: RegExp) => void };

// The app polls GitHub for the status feed. Specs that are not about the feed
// must not depend on the real network (a 403/404 logs a console error), so by
// default both hosts answer with a quiet, empty, valid feed. Specs about the
// feed register their own routes later, which take priority.
const CORS = { 'access-control-allow-origin': '*' };
const EMPTY_FEED = {
  version: 1,
  updatedAt: '2026-01-01T00:00:00Z',
  missions: [],
  members: {},
  events: [],
};

export const test = base.extend<{ consoleErrors: ConsoleErrors; quietFeed: undefined }>({
  quietFeed: [
    async ({ page }, use) => {
      await page.route('**/api.github.com/**', (r) =>
        r.fulfill({ status: 200, headers: CORS, body: 'a'.repeat(40) }),
      );
      await page.route('**/raw.githubusercontent.com/**', (r) =>
        r.fulfill({
          status: 200,
          headers: CORS,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_FEED),
        }),
      );
      await use(undefined);
    },
    { auto: true },
  ],
  consoleErrors: [
    async ({ page }, use) => {
      const list: string[] = [];
      const allowed: RegExp[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') list.push(msg.text());
      });
      page.on('pageerror', (err) => list.push(err.message));
      await use({ list, allow: (pattern) => allowed.push(pattern) });
      const unexpected = list.filter((text) => !allowed.some((re) => re.test(text)));
      expect(unexpected, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const sceneReady = (page: import('@playwright/test').Page) =>
  expect(page.locator('html')).toHaveAttribute('data-scene', 'ready');

/** Screenshot style for pixel checks of the scene: the DOM overlays sit on top of the canvas and tick. */
export const HIDE_OVERLAYS = '.ov { visibility: hidden !important; }';
