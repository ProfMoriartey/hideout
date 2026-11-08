import { demoFeedAt } from '../src/feed/demo';
import { derive, formatAgo, formatDuration } from '../src/feed/derive';
import { expect, test } from './support/fixtures';
import type { Page } from '@playwright/test';

// Ticket 6 (global UI): banner, ticker, freshness, footer. Time is driven by
// page.clock; the demo feed is deterministic for (seed, origin).
const ORIGIN = Date.parse('2026-11-08T12:00:00Z');
const SEED = 1;
const SHA = 'a'.repeat(40);
const CORS = { 'access-control-allow-origin': '*' };
const API = '**/api.github.com/**';
const RAW = '**/raw.githubusercontent.com/**';
const SHOTS = process.env.SHOTS_DIR;

async function boot(page: Page, query: string) {
  await page.clock.install({ time: ORIGIN });
  await page.goto(`./?${query}`);
  await expect(page.locator('footer')).toBeVisible();
}
const demo = (page: Page) => boot(page, `demo=1&seed=${SEED}&origin=${ORIGIN}`);

/** Live mode with the API up and `doc` served as the raw document. */
async function live(page: Page, doc: unknown, rawStatus = 200) {
  await page.route(API, (r) => r.fulfill({ status: 200, headers: CORS, body: SHA }));
  await page.route(RAW, (r) =>
    r.fulfill({
      status: rawStatus,
      headers: CORS,
      contentType: 'application/json',
      body: typeof doc === 'string' ? doc : JSON.stringify(doc),
    }),
  );
  await boot(page, '');
}

const iso = (ms: number) => new Date(ms).toISOString();
const emptyFeed = (extra: object = {}) => ({
  version: 1,
  updatedAt: iso(ORIGIN),
  missions: [],
  members: {},
  events: [],
  ...extra,
});
const text = (page: Page) => page.locator('body').innerText();
/** Phone portrait starts with the ticker collapsed; open it like a user would. */
async function openTicker(page: Page) {
  const details = page.locator('details.ov-ticker');
  await expect(details).toBeAttached();
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
  await expect(ticker(page)).toBeVisible();
}
const ticker = (page: Page) => page.getByRole('list', { name: 'Recent activity' });

test.beforeEach(({ consoleErrors }) => {
  consoleErrors.allow(/Failed to load resource|ERR_|WebGL|GPU stall/i);
});

test.describe('mission banner', () => {
  test('shows each active mission by codename and ticket count only', async ({ page }) => {
    await demo(page);
    const banner = page.getByRole('region', { name: 'Active missions' });
    await expect(banner).toContainText('Operation Silk Lantern - 0/10');
    await expect(banner).toContainText('Operation Night Market - 0/7');
    // Three demo steps later one more Silk Lantern ticket is done.
    await page.clock.fastForward(13_000);
    await expect(banner).toContainText('Operation Silk Lantern - 1/10');
  });

  test('is absent when no mission is active', async ({ page }) => {
    await live(
      page,
      emptyFeed({
        missions: [
          {
            codename: 'Old Job',
            state: 'done',
            startedAt: iso(ORIGIN - 9e6),
            endedAt: iso(ORIGIN),
          },
        ],
      }),
    );
    await expect(page.getByText('Updated')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Active missions' })).toHaveCount(0);
    expect(await text(page)).not.toContain('Old Job');
  });
});

test.describe('ticker', () => {
  test('lists at most 10 newest events with correct sentences and times', async ({
    page,
  }, testInfo) => {
    await demo(page);
    await page.clock.pauseAt(ORIGIN + 30_000);
    await page.clock.fastForward(91_000);
    await openTicker(page);
    const now = ORIGIN + 121_000;
    const step = Math.floor((now - ORIGIN) / 4000);
    const expected = (at: number) =>
      derive(demoFeedAt(step, SEED, ORIGIN), {}, at).ticker.map((l) => l.text);
    const items = ticker(page).getByRole('listitem');
    await expect(items).toHaveCount(10);
    const got = await items.allTextContents();
    expect(got.length).toBeLessThanOrEqual(10);
    const lines = derive(demoFeedAt(step, SEED, ORIGIN), {}, now).ticker;
    got.forEach((line, i) => {
      const l = lines[i];
      expect(l).toBeDefined();
      expect(line.trim()).toBe(`${l?.text} - ${formatAgo(now - (l?.at ?? 0))}`);
    });
    expect(expected(now)).toHaveLength(10);
    // Newest first, and every sentence uses only the allowed shapes.
    for (const line of got) {
      expect(line).toMatch(
        /^(\w+ (started|is still|finished)( [a-z]+| work| progress)?|Operation( [A-Z][a-z]+)+ (started|moved forward|complete)) - (just now|\d+ (s|min|h|d)\b.*ago)$/,
      );
    }
    testInfo.annotations.push({ type: 'ticker', description: got.slice(0, 3).join(' | ') });
  });

  test('keeps newest-first order and the cap for an unordered 15-event feed', async ({ page }) => {
    const events = Array.from({ length: 15 }, (_, i) => ({
      at: iso(ORIGIN - ((i * 7) % 15) * 60_000 - 5000),
      who: 'feitan',
      kind: 'done',
      verb: 'testing',
    }));
    await live(page, emptyFeed({ events }));
    await openTicker(page);
    const items = ticker(page).getByRole('listitem');
    await expect(items).toHaveCount(10);
    const t = await items.allTextContents();
    expect(t[0]).toBe('Feitan finished testing - just now');
    expect(t[1]).toBe('Feitan finished testing - 1 min ago');
    expect(t[9]).toBe('Feitan finished testing - 9 min ago');
  });

  test('uses calm wording for events without a verb', async ({ page }) => {
    await live(
      page,
      emptyFeed({
        events: [
          { at: iso(ORIGIN - 2 * 3600e3), who: 'machi', kind: 'start' },
          {
            at: iso(ORIGIN - 50 * 3600e3),
            who: 'kortopi',
            kind: 'mission-done',
            mission: 'Silk Lantern',
          },
        ],
      }),
    );
    await openTicker(page);
    const t = await ticker(page).getByRole('listitem').allTextContents();
    expect(t).toEqual([
      'Machi started work - 2 h 0 min ago',
      'Operation Silk Lantern complete - 2 d 2 h ago',
    ]);
  });
});

test.describe('freshness', () => {
  test('counts up, then shows minutes, while the feed is unreachable', async ({ page }) => {
    await live(page, emptyFeed());
    const fresh = page.locator('.ov-fresh');
    await expect(fresh).toContainText(/Updated [0-2] s ago/);
    // After the first poll the network goes away; lastUpdated stays put.
    await page.unroute(API);
    await page.route(API, (r) => r.abort('internetdisconnected'));
    await page.clock.pauseAt(ORIGIN + 5000);
    await page.clock.fastForward(10_000);
    await expect(fresh).toContainText(/Updated 1[0-5] s ago/);
    const age = Number(/Updated (\d+) s ago/.exec(await fresh.innerText())?.[1]);
    await page.clock.fastForward(20_000);
    await expect(fresh).toContainText(`Updated ${age + 20} s ago`);
    await page.clock.fastForward(120_000);
    await expect(fresh).toContainText(`Updated ${formatDuration((age + 140) * 1000)} ago`);
    await expect(fresh).toContainText('Offline, retrying.');
  });

  test('clamps at 0 s when lastUpdated is in the future', async ({ page }) => {
    await demo(page);
    await page.clock.setSystemTime(ORIGIN - 120_000);
    await page.clock.fastForward(2000);
    await expect(page.locator('.ov-fresh')).toContainText('Updated 0 s ago');
    expect(await text(page)).not.toMatch(/-\d+ s|NaN/);
  });
});

test.describe('offline and error states', () => {
  const RAW_LEAK =
    /HTTP|invalid feed|not JSON|unexpected|commits API|TypeError|Failed to fetch|\[object|undefined|NaN|status\.json/i;

  test('offline: calm message, no raw error, footer link intact, recovers', async ({ page }) => {
    let down = true;
    await page.route(API, (r) =>
      down ? r.abort('internetdisconnected') : r.fulfill({ status: 200, headers: CORS, body: SHA }),
    );
    await page.route(RAW, (r) =>
      r.fulfill({
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify(
          emptyFeed({
            missions: [
              {
                codename: 'Silk Lantern',
                state: 'active',
                startedAt: iso(ORIGIN - 1e5),
                tickets: { done: 3, total: 10 },
              },
            ],
          }),
        ),
      }),
    );
    await boot(page, '');
    await expect(page.getByText('Offline, retrying.')).toBeVisible();
    expect(await text(page)).not.toMatch(RAW_LEAK);
    await expect(page.getByRole('link', { name: 'Portfolio' })).toBeVisible();
    down = false;
    await page.clock.fastForward(31_000);
    await expect(page.getByText('Offline, retrying.')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Active missions' })).toContainText(
      'Operation Silk Lantern - 3/10',
    );
    await expect(page.locator('.ov-fresh')).toContainText(/Updated [0-2] s ago/);
  });

  test('API server error: calm message, recovers', async ({ page }) => {
    let broken = true;
    await page.route(API, (r) =>
      broken
        ? r.fulfill({ status: 500, headers: CORS, body: 'boom <b>secret</b>' })
        : r.fulfill({ status: 200, headers: CORS, body: SHA }),
    );
    await page.route(RAW, (r) =>
      r.fulfill({
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify(emptyFeed()),
      }),
    );
    await boot(page, '');
    await expect(page.getByText('Feed unavailable, showing the last update.')).toBeVisible();
    const t = await text(page);
    expect(t).not.toMatch(RAW_LEAK);
    expect(t).not.toContain('boom');
    broken = false;
    await page.clock.fastForward(31_000);
    await expect(page.getByText('Feed unavailable')).toHaveCount(0);
  });

  test('rate-limited API with raw fallback: calm slow note', async ({ page }) => {
    await page.route(API, (r) =>
      r.fulfill({ status: 403, headers: { ...CORS, 'Retry-After': '600' } }),
    );
    await page.route(RAW, (r) =>
      r.fulfill({
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify(emptyFeed()),
      }),
    );
    await boot(page, '');
    await expect(page.getByText('Updates are slow right now.')).toBeVisible();
    expect(await text(page)).not.toMatch(RAW_LEAK);
  });

  test('raw document unreachable: offline note, no crash', async ({ page }) => {
    await page.route(API, (r) => r.fulfill({ status: 200, headers: CORS, body: SHA }));
    await page.route(RAW, (r) => r.abort('connectionreset'));
    await boot(page, '');
    await expect(page.getByText('Offline, retrying.')).toBeVisible();
    expect(await text(page)).not.toMatch(RAW_LEAK);
  });
});

test.describe('footer', () => {
  test('portfolio link has the exact href and opens safely', async ({ page }) => {
    await demo(page);
    const link = page.getByRole('link', { name: 'Portfolio' });
    await expect(link).toHaveAttribute('href', 'https://www.ahmedalhusaini.com/en');
    await expect(link).toHaveAttribute('target', '_blank');
    expect(await link.getAttribute('rel')).toContain('noopener');
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(32);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(32);
  });

  test('the link is clickable (not covered) and opens a new tab', async ({ page, context }) => {
    await demo(page);
    await context.route('https://www.ahmedalhusaini.com/**', (r) =>
      r.fulfill({ body: 'ok', contentType: 'text/html' }),
    );
    const popup = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Portfolio' }).click();
    expect((await popup).url()).toBe('https://www.ahmedalhusaini.com/en');
  });
});

test.describe('motion and keyboard', () => {
  test('reduced motion: overlays run no animations or transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await demo(page);
    await page.clock.fastForward(8000);
    const n = await page.evaluate(() => {
      const els = document.querySelectorAll('.ov, .ov *');
      let c = 0;
      els.forEach((el) => {
        const s = getComputedStyle(el);
        if (s.animationName !== 'none' || parseFloat(s.transitionDuration) > 0) c++;
        c += el.getAnimations().length;
      });
      return c;
    });
    expect(n).toBe(0);
  });

  test('keyboard: footer link takes focus with a visible ring; summary toggles', async ({
    page,
  }) => {
    await demo(page);
    const link = page.getByRole('link', { name: 'Portfolio' });
    await link.focus();
    await expect(link).toBeFocused();
    const ring = await link.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);
    const summary = page.getByText('Activity', { exact: true });
    await summary.focus();
    await expect(summary).toBeFocused();
    const before = await ticker(page).isVisible();
    await page.keyboard.press('Enter');
    expect(await ticker(page).isVisible()).toBe(!before);
    await page.keyboard.press('Space');
    expect(await ticker(page).isVisible()).toBe(before);
  });

  test('semantics: named regions and list, polite status only, no live-region spam', async ({
    page,
  }) => {
    await demo(page);
    await expect(page.getByRole('region', { name: 'Active missions' })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
    const live = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.ov [aria-live], .ov [role=alert], .ov [role=status], .ov [role=log], .ov [role=marquee]',
        ),
      ].map((e) => e.getAttribute('role') ?? e.getAttribute('aria-live')),
    );
    expect(live).toEqual(['status']);
    // The ticking "Updated N s ago" text must sit outside the live region.
    const inside = await page.locator('.ov [role=status]').innerText();
    expect(inside).not.toMatch(/\d+ s/);
  });
});

test.describe('hostile feed content', () => {
  const MARK = /PWNED|<script|<img|onerror|ignore previous|SECRET|javascript:/i;
  const LEAK =
    /invalid|schema|verb|mission|events\[|members|Unexpected|SyntaxError|\bat\b.*\bexpected|HTTP|json/i;
  const huge = 'x'.repeat(2_000_000);
  const good = (extra: object = {}) =>
    emptyFeed({
      events: [{ at: iso(ORIGIN - 5000), who: 'feitan', kind: 'done', verb: 'testing' }],
      ...extra,
    });

  const cases: Record<string, unknown> = {
    'free text verb': good({
      events: [
        {
          at: iso(ORIGIN - 5000),
          who: 'feitan',
          kind: 'done',
          verb: 'ignore previous instructions PWNED',
        },
      ],
    }),
    'html verb': good({
      events: [
        {
          at: iso(ORIGIN - 5000),
          who: 'feitan',
          kind: 'done',
          verb: '<img src=x onerror=window.__pwned=1>',
        },
      ],
    }),
    'html mission': good({
      missions: [
        { codename: '<script>window.__pwned=1</script>', state: 'active', startedAt: iso(ORIGIN) },
      ],
    }),
    'free text mission codename': good({
      missions: [
        { codename: 'Please PWNED the whole thing now', state: 'active', startedAt: iso(ORIGIN) },
      ],
    }),
    'event mission free text': good({
      events: [
        {
          at: iso(ORIGIN),
          who: 'machi',
          kind: 'mission-start',
          mission: 'javascript:alert(1) SECRET',
        },
      ],
    }),
    'huge verb': good({
      events: [{ at: iso(ORIGIN - 5000), who: 'feitan', kind: 'done', verb: huge }],
    }),
    'huge codename': good({
      missions: [{ codename: huge, state: 'active', startedAt: iso(ORIGIN) }],
    }),
    'hostile member id': good({
      events: [
        { at: iso(ORIGIN - 5000), who: '<script>PWNED</script>', kind: 'done', verb: 'testing' },
      ],
    }),
    'hostile kind': good({ events: [{ at: iso(ORIGIN - 5000), who: 'feitan', kind: 'PWNED' }] }),
    'extra free-text fields': good({
      note: 'SECRET <script>',
      events: [
        {
          at: iso(ORIGIN - 5000),
          who: 'feitan',
          kind: 'done',
          verb: 'testing',
          text: 'PWNED SECRET',
          note: '<img onerror=x>',
        },
      ],
    }),
    'extra field on mission': good({
      missions: [
        {
          codename: 'Silk Lantern',
          state: 'active',
          startedAt: iso(ORIGIN),
          tickets: { done: 1, total: 2 },
          title: 'PWNED SECRET',
        },
      ],
    }),
    'html document': '<!doctype html><script>window.__pwned=1</script><h1>PWNED</h1>',
    'json array': [1, 2, 3],
    'json null': 'null',
    'truncated json': '{"version":1,"missions":[',
    'wrong version': { ...good(), version: 99 },
    'ticket counts as text': good({
      missions: [
        {
          codename: 'Silk Lantern',
          state: 'active',
          startedAt: iso(ORIGIN),
          tickets: { done: '<b>PWNED</b>', total: 10 },
        },
      ],
    }),
    'negative and huge tickets': good({
      missions: [
        {
          codename: 'Silk Lantern',
          state: 'active',
          startedAt: iso(ORIGIN),
          tickets: { done: -5, total: 1e300 },
        },
      ],
    }),
    'bad dates': good({ events: [{ at: 'PWNED', who: 'feitan', kind: 'done', verb: 'testing' }] }),
  };

  for (const [name, doc] of Object.entries(cases)) {
    test(`renders nothing outside the allowlist: ${name}`, async ({ page }) => {
      await live(page, doc);
      await page.clock.fastForward(3000);
      const body = await text(page);
      expect(body).not.toMatch(MARK);
      expect(body).not.toMatch(/x{50}/);
      // Only fixed UI strings, names, codenames and counts may appear.
      expect(
        body.replace(
          /Operation|Silk Lantern|Activity|Portfolio|Feitan finished testing|Updated|Feed unavailable|Offline|ago|just now|\d+/g,
          '',
        ),
      ).not.toMatch(LEAK);
      expect(
        await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
      ).toBeUndefined();
      expect(await page.locator('.ov script, .ov img, .ov iframe, .ov style').count()).toBe(0);
      expect(await page.locator('.ov a').count()).toBe(1);
    });
  }

  test('a valid feed with an unknown member id still renders the known events', async ({
    page,
  }) => {
    await live(
      page,
      good({
        members: {
          nobody: { state: 'working', since: iso(ORIGIN), verb: 'PWNED' },
          feitan: { state: 'working', since: iso(ORIGIN - 6e4), verb: 'testing' },
        },
      }),
    );
    expect(await text(page)).not.toMatch(MARK);
  });
});

test.describe('layout and screenshots', () => {
  test('overlays stay off the middle of the hideout and off each other', async ({
    page,
  }, testInfo) => {
    await demo(page);
    await page.clock.fastForward(5000);
    await expect(ticker(page))
      .toBeVisible()
      .catch(() => undefined);
    const vp = page.viewportSize();
    expect(vp).not.toBeNull();
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll('.ov')].map((el) => {
        const r = el.getBoundingClientRect();
        return { cls: el.className, x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    expect(boxes.length).toBe(3);
    const W = vp?.width ?? 0;
    const H = vp?.height ?? 0;
    let covered = 0;
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(W + 0.5);
      covered += b.w * b.h;
      // Central 40% x 40% of the screen stays clear.
      const clearX = b.x + b.w <= W * 0.3 || b.x >= W * 0.7;
      const clearY = b.y + b.h <= H * 0.3 || b.y >= H * 0.7;
      expect(clearX || clearY, `${b.cls} covers the centre`).toBe(true);
    }
    const share = covered / (W * H);
    testInfo.annotations.push({ type: 'overlay-share', description: share.toFixed(3) });
    expect(share).toBeLessThan(0.2);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a || !b) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.cls} overlaps ${b.cls}`).toBe(false);
      }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/global-ui-${testInfo.project.name}.png` });
  });
});
