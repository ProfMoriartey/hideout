import { test as base, expect } from '@playwright/test';

// Collects console errors and uncaught page errors for every test and fails
// the test if any were seen. Tests that expect errors (WebGL off, chunk
// failure) call `consoleErrors.allow(pattern)` first.
type ConsoleErrors = { list: string[]; allow: (pattern: RegExp) => void };

export const test = base.extend<{ consoleErrors: ConsoleErrors }>({
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
