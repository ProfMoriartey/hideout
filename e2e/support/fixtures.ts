import { test as base, expect } from '@playwright/test';

// Collects console errors and uncaught page errors for every test and fails
// the test if any were seen. Tests that expect errors (WebGL off, chunk
// failure) call `consoleErrors.allow(pattern)` first.
type ConsoleErrors = { list: string[]; allow: (pattern: RegExp) => void };

const SHA = 'e2e0000000000000000000000000000000000000';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'If-None-Match, Accept',
  'access-control-expose-headers': 'ETag, X-RateLimit-Remaining, X-RateLimit-Reset',
};

export const test = base.extend<{ consoleErrors: ConsoleErrors; liveFeed: undefined }>({
  // The scene polls the live feed (GitHub) as soon as it mounts. Answer it
  // locally with an all-idle feed so no test depends on the network; specs
  // that need other answers add their own page.route, which takes precedence.
  liveFeed: [
    async ({ page }, use) => {
      await page.route('https://api.github.com/**', (route) =>
        route.request().method() === 'OPTIONS'
          ? route.fulfill({ status: 204, headers: CORS })
          : route.fulfill({
              status: 200,
              headers: {
                ...CORS,
                ETag: `"${SHA}"`,
                'X-RateLimit-Remaining': '59',
                'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
              },
              body: SHA,
            }),
      );
      await page.route('https://raw.githubusercontent.com/**', (route) =>
        route.fulfill({
          status: 200,
          headers: CORS,
          contentType: 'application/json',
          body: JSON.stringify({
            version: 1,
            updatedAt: new Date().toISOString(),
            missions: [],
            members: {},
            events: [],
          }),
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
