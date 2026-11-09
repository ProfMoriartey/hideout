import { build } from 'vite';
import { demoFeedAt, demoStep, DEMO_STEP_MS } from '../src/feed/demo';
import { displayState } from '../src/feed/derive';
import { MEMBER_IDS } from '../src/feed/validate';
import { expect, test } from './support/fixtures';
import type { Page } from '@playwright/test';

// The app does not render the feed yet, so these drive the real store through a
// tiny harness page (e2e/feed-harness), bundled here and served by route.
const ORIGIN = Date.parse('2026-11-08T12:00:00Z');
const SEED = 1;
let script = '';

test.beforeAll(async () => {
  const out = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      lib: { entry: 'e2e/feed-harness/main.ts', formats: ['iife'], name: 'harness' },
    },
  });
  const outputs = Array.isArray(out) ? out : [out];
  const first = outputs.flatMap((o) => ('output' in o ? o.output : []))[0];
  if (!first || first.type !== 'chunk') throw new Error('harness build produced no chunk');
  script = first.code;
});

async function open(page: Page, query: string) {
  await page.clock.install({ time: ORIGIN });
  await page.route('**/feed-harness.html*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><meta charset="utf-8"><div id="root"></div><script>${script}</script>`,
    }),
  );
  await page.goto(`feed-harness.html?${query}`);
}

const displays = (page: Page) => page.locator('li').allTextContents();
const expected = (step: number) => {
  const feed = demoFeedAt(step, SEED, ORIGIN);
  const now = ORIGIN + step * DEMO_STEP_MS + 100;
  return MEMBER_IDS.map((id) => displayState(feed.members[id], now));
};

test.describe('?demo=1', () => {
  test('is deterministic with ?origin and follows the clock, step by step', async ({ page }) => {
    await open(page, `demo=1&seed=${SEED}&origin=${ORIGIN}`);
    await expect(page.locator('#status')).toHaveText('live');
    await expect(page.locator('#source')).toHaveText('demo');
    // Freeze time so every step is reached exactly, never by wall-clock drift.
    await page.clock.pauseAt(ORIGIN + 1000);
    // 100 ms past each boundary: the source's own timer may fire a few ms late.
    await page.clock.runFor(DEMO_STEP_MS - 900);
    const seen = new Set<string>();
    for (let step = 1; step <= 12; step++) {
      expect(demoStep(ORIGIN + step * DEMO_STEP_MS, ORIGIN)).toBe(step);
      await expect
        .poll(async () => {
          const t = Number(await page.locator('#updated').textContent());
          return (
            t - (ORIGIN + step * DEMO_STEP_MS) >= 0 && t - (ORIGIN + step * DEMO_STEP_MS) < 100
          );
        })
        .toBe(true);
      await expect.poll(() => displays(page)).toEqual(expected(step));
      (await displays(page)).forEach((d) => seen.add(d));
      await page.clock.runFor(DEMO_STEP_MS);
    }
    expect([...seen].sort()).toEqual(['done', 'idle', 'stale', 'working']);
  });
});

test.describe('live feed errors', () => {
  test.beforeEach(({ consoleErrors }) => {
    consoleErrors.allow(/Failed to load resource|ERR_/);
  });

  const API = '**/api.github.com/**';

  test('offline: shows offline, then recovers when the network returns', async ({ page }) => {
    let down = true;
    await page.route(API, (route) =>
      down ? route.abort('internetdisconnected') : route.fulfill({ status: 500 }),
    );
    await open(page, '');
    await expect(page.locator('#status')).toHaveText('offline');
    expect(await displays(page)).toEqual(MEMBER_IDS.map(() => 'idle'));
    down = false;
    await page.clock.runFor(30_000);
    await expect(page.locator('#status')).toHaveText('error');
  });

  test('API limit: falls back to raw main and says so', async ({ page }) => {
    await page.route(API, (route) =>
      route.fulfill({ status: 403, headers: { 'Retry-After': '600' } }),
    );
    await page.route('**/raw.githubusercontent.com/**', (route) =>
      route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          version: 1,
          updatedAt: '2026-11-08T11:58:00Z',
          missions: [],
          members: { feitan: { state: 'working', since: '2026-11-08T11:50:00Z', verb: 'testing' } },
          events: [],
        }),
      }),
    );
    await open(page, '');
    await expect(page.locator('#status')).toHaveText('stale-source');
    await expect(page.locator('#source')).toHaveText('raw-fallback');
    await expect(page.locator('li[data-id="feitan"]')).toHaveText('working');
  });

  test('hidden tab makes no API calls', async ({ page }) => {
    let calls = 0;
    await page.route(API, (route) => {
      calls++;
      return route.fulfill({ status: 500 });
    });
    await open(page, '');
    await expect(page.locator('#status')).toHaveText('error');
    const before = calls;
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(5 * 60_000);
    expect(calls).toBe(before);
  });
});
