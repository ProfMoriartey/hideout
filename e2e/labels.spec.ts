import { MEMBERS } from '../src/config/members';
import { demoFeedAt, DEMO_STEP_MS } from '../src/feed/demo';
import { displayState, formatDuration, type DisplayState } from '../src/feed/derive';
import type { MemberId } from '../src/feed/types';
import { expect, sceneReady, test } from './support/fixtures';
import type { Locator, Page } from '@playwright/test';

// Ticket 5: room labels and the tap panel, driven by ?demo=1 under a fake clock
// (see members.spec.ts for why: page.clock freezes rAF and timers until advanced).
const ORIGIN = Date.parse('2026-11-08T12:00:00Z');
const SEED = 3;
const DRAW_CALL_BUDGET = 60;
const stepStart = (step: number) => ORIGIN + step * DEMO_STEP_MS;

const labels = (page: Page) => page.locator('.room-label');
const label = (page: Page, id: string) => page.locator(`.room-label[data-room="${id}"]`);
const panel = (page: Page) => page.getByRole('dialog');
const NAMES = Object.fromEntries(MEMBERS.map((m) => [m.id, m]));

async function waitReady(page: Page) {
  for (let i = 0; i < 100; i++) {
    if ((await page.locator('html').getAttribute('data-scene')) === 'ready') break;
    await page.clock.runFor(100);
    await page.waitForTimeout(20);
  }
  await sceneReady(page);
  await expect(labels(page)).toHaveCount(13);
  await frames(page);
}

async function open(page: Page) {
  await page.clock.install({ time: ORIGIN });
  await page.clock.pauseAt(ORIGIN + 1000);
  await page.goto(`./?demo=1&seed=${SEED}&origin=${ORIGIN}`);
  await waitReady(page);
}

/** Fake-time frames so the camera, labels and feed catch up. */
async function frames(page: Page, ms = 400) {
  await page.clock.runFor(ms);
  await page.waitForTimeout(30);
}

async function goTo(page: Page, step: number, offsetMs = 100) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.fastForward(stepStart(step) + offsetMs - now - 200);
  await frames(page);
}

const expectedAt = (step: number, offsetMs = 100) => {
  const feed = demoFeedAt(step, SEED, ORIGIN);
  return MEMBERS.map((m) => {
    const status = feed.members[m.id as MemberId];
    return {
      id: m.id as MemberId,
      status,
      display: displayState(status, stepStart(step) + offsetMs),
    };
  });
};
const ALL_STATES: DisplayState[] = ['idle', 'working', 'done', 'stale'];
const stepWithAllStates = () => {
  const s = Array.from({ length: 10 }, (_, i) => i + 1).find((c) => {
    const d = expectedAt(c).map((x) => x.display);
    return ALL_STATES.every((k) => d.includes(k));
  });
  if (s === undefined) throw new Error('no demo step has all four states');
  return s;
};

const roomPx = (page: Page) =>
  page.evaluate(() =>
    parseFloat(
      document.querySelector<HTMLElement>('.room-labels')?.style.getPropertyValue('--room-px') ??
        '0',
    ),
  );

/** A page point inside a room: just under its label (the label sits above the room's open front). */
async function roomPoint(page: Page, id: string) {
  const b = await label(page, id).boundingBox();
  if (!b) throw new Error(`no box for ${id}`);
  return { x: b.x + b.width / 2, y: b.y + b.height + (await roomPx(page)) * 0.3 };
}

async function tapRoom(page: Page, id: string) {
  const p = await roomPoint(page, id);
  await page.mouse.click(p.x, p.y);
  await frames(page);
}

async function facts(p: Locator) {
  const dts = await p.locator('dt').allTextContents();
  const dds = await p.locator('dd').allTextContents();
  return Object.fromEntries(dts.map((t, i) => [t, (dds[i] ?? '').replace(/\s+/g, ' ').trim()]));
}

const shot = (page: Page, name: string, testInfo: { project: { name: string } }) =>
  page.screenshot({ path: `e2e/screenshots/labels-${name}-${testInfo.project.name}.png` });

/** WCAG contrast ratio of two rgb()/rgba() strings (alpha ignored). */
function contrast(a: string, b: string) {
  const lum = (c: string) => {
    const [r = 0, g = 0, bl = 0] = (c.match(/[\d.]+/g) ?? []).map(Number);
    const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const overlap = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) =>
  Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) &&
  Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);

test('all 13 labels show name and role, on screen, legible, not overlapping (default view)', async ({
  page,
}, testInfo) => {
  await open(page);
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.room-label')].map((el) => {
      const r = el.getBoundingClientRect();
      const n = el.querySelector<HTMLElement>('.room-name');
      const role = el.querySelector<HTMLElement>('.room-role');
      return {
        id: el.dataset['room'] ?? '',
        name: n?.textContent,
        role: role?.textContent,
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        nameFont: n ? parseFloat(getComputedStyle(n).fontSize) : 0,
        roleFont: role ? parseFloat(getComputedStyle(role).fontSize) : 0,
        color: getComputedStyle(role ?? el).color,
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
      };
    }),
  );
  const vp = page.viewportSize();
  if (!vp) throw new Error('no viewport');
  expect(rows.map((r) => r.id).sort()).toEqual(MEMBERS.map((m) => m.id).sort());
  for (const r of rows) {
    expect(r.name, r.id).toBe(NAMES[r.id]?.name);
    expect(r.role, r.id).toBe(NAMES[r.id]?.role);
    expect(r.x, `${r.id} left`).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w, `${r.id} right`).toBeLessThanOrEqual(vp.width);
    expect(r.y, `${r.id} top`).toBeGreaterThanOrEqual(0);
    expect(r.y + r.h, `${r.id} bottom`).toBeLessThanOrEqual(vp.height);
    expect(r.nameFont, `${r.id} name font`).toBeGreaterThanOrEqual(11);
    expect(r.roleFont, `${r.id} role font`).toBeGreaterThanOrEqual(10);
    expect(contrast(r.color, 'rgb(11, 10, 16)'), `${r.id} contrast`).toBeGreaterThanOrEqual(4.5);
    expect(r.scrollW, `${r.id} text fits`).toBeLessThanOrEqual(r.clientW + 1);
  }
  const overlaps: string[] = [];
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (a && b && overlap(a, b)) overlaps.push(`${a.id}/${b.id}`);
    }
  testInfo.annotations.push({
    type: 'label sizes',
    description: JSON.stringify(rows.map((r) => [r.id, Math.round(r.w), Math.round(r.h)])),
  });
  await shot(page, 'default', testInfo);
  expect(overlaps, 'overlapping labels').toEqual([]);
});

test('labels follow the camera; the plaque shows only when rooms are big', async ({ page }) => {
  await open(page);
  expect(await page.locator('.room-labels[data-plaque]').count(), 'no plaque at default').toBe(0);
  const before = await label(page, 'chrollo').boundingBox();
  const vp = page.viewportSize();
  await page.mouse.move((vp?.width ?? 800) / 2, (vp?.height ?? 600) / 2);
  for (let i = 0; i < 14; i++) {
    await page.mouse.wheel(0, -300);
    await frames(page, 100);
  }
  expect(await label(page, 'chrollo').boundingBox()).not.toEqual(before);
  const px = await roomPx(page);
  expect(px).toBeGreaterThan(0);
  await expect(page.locator('.room-labels[data-plaque]')).toHaveCount(px >= 260 ? 1 : 0);
});

test('tap each room: its panel opens with the right fields for idle, working, done, stale', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await open(page);
  const step = stepWithAllStates();
  const seen = new Set<DisplayState>();
  const STATE_TEXT = {
    idle: 'Idle',
    working: 'Working',
    done: 'Done',
    stale: 'No recent update',
  };
  let shotTaken = false;
  for (const [i, m] of MEMBERS.entries()) {
    // One demo step per room so the clock sits just after a step boundary and the expected
    // state is exact; across 13 steps every state comes up (a cycle is 10 steps).
    const at = step + i;
    await goTo(page, at);
    const e = expectedAt(at).find((x) => x.id === m.id);
    if (!e) throw new Error(m.id);
    const cfg = NAMES[e.id];
    await tapRoom(page, e.id);
    const p = panel(page);
    await expect(p, e.id).toBeVisible();
    await expect(p.getByRole('heading')).toHaveText(cfg?.name ?? '');
    await expect(p).toContainText(cfg?.role ?? '');
    await expect(p).toContainText(cfg?.plaque ?? '');
    const f = await facts(p);
    seen.add(e.display);
    expect(f['State'], `${e.id} state`).toBe(STATE_TEXT[e.display]);
    if (e.display === 'working') {
      const pr = e.status?.progress;
      const since = Date.parse(e.status?.since ?? '');
      const now = await page.evaluate(() => Date.now());
      expect(f['Doing'], `${e.id} verb`).toBe(e.status?.verb);
      expect(f['Mission'], `${e.id} mission`).toBe(`Operation ${e.status?.mission}`);
      expect(
        [-1000, 0, 1000].map((d) => formatDuration(now + d - since)),
        `${e.id} running`,
      ).toContain(f['Running']);
      expect(f['Tickets'], `${e.id} tickets`).toBe(`${pr?.done} / ${pr?.total}`);
      const bar = p.getByRole('progressbar');
      await expect(bar).toHaveAttribute('aria-valuenow', String(pr?.done));
      await expect(bar).toHaveAttribute('aria-valuemax', String(pr?.total));
      if (!shotTaken) {
        shotTaken = true;
        await shot(page, 'panel-working', testInfo);
      }
    } else {
      expect(f['Doing'], `${e.id} verb only while working`).toBeUndefined();
      expect(f['Tickets'], `${e.id} tickets only while working`).toBeUndefined();
    }
    if (e.display === 'stale') expect(f['Running'], 'stale hides running time').toBeUndefined();
    await page.keyboard.press('Escape');
    await expect(p).toHaveCount(0);
    await frames(page, 1500);
  }
  expect([...seen].sort()).toEqual(['done', 'idle', 'stale', 'working']);
});

test('labels carry the verb for working rooms and "no recent update" for stale ones', async ({
  page,
}) => {
  await open(page);
  const step = stepWithAllStates();
  await goTo(page, step);
  for (const e of expectedAt(step)) {
    const verb = label(page, e.id).locator('.room-verb');
    if (e.display === 'working') await expect(verb, e.id).toHaveText(e.status?.verb ?? '');
    else if (e.display === 'stale') await expect(verb, e.id).toHaveText('no recent update');
    else await expect(verb, e.id).toHaveText('');
    await expect(label(page, e.id)).toHaveAttribute('data-state', e.display);
  }
});

test('close with the button, Escape, or a tap outside; tapping another room switches', async ({
  page,
}) => {
  test.slow(); // software GL: 14 wheel zooms with frames exceed 30 s when 2 workers share the CPU
  await open(page);
  await tapRoom(page, 'chrollo');
  await expect(panel(page).getByRole('heading')).toHaveText('Chrollo');
  await panel(page).getByRole('button', { name: 'Close' }).click();
  await expect(panel(page)).toHaveCount(0);
  await frames(page, 1500);

  await tapRoom(page, 'kortopi');
  await expect(panel(page).getByRole('heading')).toHaveText('Kortopi');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await frames(page, 1500);

  await tapRoom(page, 'chrollo');
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await frames(page, 1500);

  await tapRoom(page, 'chrollo');
  await frames(page, 1500);
  // The focus view fills the screen with rooms: zoom out, then tap the empty corner.
  const vp = page.viewportSize();
  await page.mouse.move((vp?.width ?? 800) / 2, (vp?.height ?? 600) / 2);
  for (let i = 0; i < 14; i++) {
    await page.mouse.wheel(0, 300);
    await frames(page, 100);
  }
  await expect(panel(page)).toBeVisible();
  // Empty corner (desktop) or the empty ground below the hideout (phone portrait).
  const wide = (vp?.width ?? 0) > 600;
  await page.mouse.click(wide ? 4 : 200, wide ? 120 : 620);
  await frames(page);
  await expect(panel(page)).toHaveCount(0);
});

test('a drag never opens a panel; slow press and right button do not either', async ({ page }) => {
  await open(page);
  const p = await roomPoint(page, 'chrollo');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 40, p.y + 25, { steps: 8 });
  await page.mouse.up();
  await frames(page);
  await expect(panel(page)).toHaveCount(0);

  const q = await roomPoint(page, 'kortopi');
  await page.mouse.move(q.x, q.y);
  await page.mouse.down();
  await page.mouse.move(q.x + 12, q.y, { steps: 2 }); // just past the 8 px slop
  await page.mouse.up();
  await frames(page);
  await expect(panel(page)).toHaveCount(0);

  const r = await roomPoint(page, 'chrollo');
  await page.mouse.move(r.x, r.y);
  await page.mouse.down();
  await page.clock.runFor(700); // longer than the 500 ms tap window
  await page.mouse.up();
  await frames(page);
  await expect(panel(page)).toHaveCount(0);

  await page.mouse.click(r.x, r.y, { button: 'right' });
  await frames(page);
  await expect(panel(page)).toHaveCount(0);
});

test('focus moves into the panel and back to the label; the keyboard opens a room', async ({
  page,
}) => {
  await open(page);
  const k = label(page, 'kortopi');
  await k.focus();
  await page.keyboard.press('Enter');
  await frames(page);
  const p = panel(page);
  await expect(p).toBeVisible();
  await expect(p).toBeFocused();
  await expect(p).toHaveAttribute('aria-labelledby', 'room-panel-title');
  await expect(p.getByRole('heading')).toHaveAttribute('id', 'room-panel-title');
  await page.keyboard.press('Tab');
  await expect(p.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(p).toHaveCount(0);
  await expect(k).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(p).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(p).toHaveCount(0);
  await expect(k).toBeFocused();
  await page.keyboard.press('Space');
  await expect(p).toBeVisible();
});

test('Tab reaches all 13 labels, each a button with a name', async ({ page }) => {
  await open(page);
  const reached = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement?.getAttribute('data-room') ?? '');
    if (id) {
      reached.add(id);
      const b = await label(page, id).boundingBox();
      const vp = page.viewportSize();
      expect(b && vp && b.x >= 0 && b.x + b.width <= vp.width && b.y >= 0, `${id} on screen`).toBe(
        true,
      );
    }
  }
  expect([...reached].sort()).toEqual(MEMBERS.map((m) => m.id).sort());
  for (const m of MEMBERS)
    await expect(page.getByRole('button', { name: new RegExp(`^${m.name}`) })).toHaveCount(1);
});

test('panel does not collide with banner or footer; labels do not hide behind overlays', async ({
  page,
}, testInfo) => {
  await open(page);
  await tapRoom(page, 'chrollo');
  const vp = page.viewportSize();
  const p = await panel(page).boundingBox();
  if (!p || !vp) throw new Error('no panel');
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x + p.width).toBeLessThanOrEqual(vp.width);
  expect(p.y + p.height).toBeLessThanOrEqual(vp.height);
  const rect = (b: { x: number; y: number; width: number; height: number }) => ({
    x: b.x,
    y: b.y,
    w: b.width,
    h: b.height,
  });
  for (const sel of ['.ov-banner', '.ov-foot', '.ov-ticker']) {
    const o = await page.locator(sel).first().boundingBox();
    if (o) expect(overlap(rect(p), rect(o)), `panel overlaps ${sel}`).toBe(false);
  }
  await shot(page, 'panel-open', testInfo);
  await page.keyboard.press('Escape');
  await frames(page, 1500);
  const hits: string[] = [];
  for (const sel of ['.ov-banner', '.ov-foot', '.ov-ticker']) {
    const o = await page.locator(sel).first().boundingBox();
    if (!o) continue;
    for (const m of MEMBERS) {
      const l = await label(page, m.id).boundingBox();
      if (l && overlap(rect(l), rect(o))) hits.push(`${m.id}/${sel}`);
    }
  }
  expect(hits, 'labels under overlays').toEqual([]);
});

test('reduced motion: the panel does not animate', async ({ browser }, testInfo) => {
  const ctx = await browser.newContext({ ...testInfo.project.use, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.route('https://api.github.com/**', (r) => r.abort());
  await open(page);
  await tapRoom(page, 'chrollo');
  await expect(panel(page)).toBeVisible();
  expect(await panel(page).evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await ctx.close();
});

test('hostile feed values (html, error text, long strings) never render', async ({
  page,
  consoleErrors,
}) => {
  consoleErrors.allow(/.*/);
  const SHA = 'a'.repeat(40);
  const now = new Date().toISOString();
  const bad = {
    version: 1,
    updatedAt: now,
    missions: [{ codename: '<img src=x onerror=alert(1)>', state: 'active', startedAt: now }],
    members: {
      chrollo: {
        state: 'working',
        since: now,
        verb: '<b>SECRET</b> Error: ENOENT /home/x/.ssh',
        mission: 'Silk Lantern" onmouseover="x',
      },
      kortopi: {
        state: 'working',
        since: now,
        verb: 'x'.repeat(5000),
        progress: { done: 'DROP TABLE', total: 3 },
      },
      phinks: {
        state: 'idle',
        since: now,
        error: 'Traceback: token=abc123',
        message: 'stack trace',
      },
    },
    events: [],
    error: 'Error: connection string postgres://user:pw@host',
  };
  const cors = { 'access-control-allow-origin': '*' };
  await page.route('https://raw.githubusercontent.com/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: cors,
      body: JSON.stringify(bad),
    }),
  );
  await page.route('https://api.github.com/**', (r) =>
    r.request().method() === 'OPTIONS'
      ? r.fulfill({
          status: 204,
          headers: { ...cors, 'access-control-allow-headers': 'If-None-Match, Accept' },
        })
      : r.fulfill({
          status: 200,
          headers: {
            ...cors,
            ETag: `"${SHA}"`,
            'access-control-expose-headers': 'ETag, X-RateLimit-Remaining, X-RateLimit-Reset',
            'X-RateLimit-Remaining': '59',
            'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
          },
          body: SHA,
        }),
  );
  await page.clock.install({ time: ORIGIN });
  await page.clock.pauseAt(ORIGIN + 1000);
  await page.goto('./');
  await waitReady(page);
  await frames(page, 2000);
  for (const id of ['chrollo', 'kortopi', 'phinks']) {
    await tapRoom(page, id);
    await expect(panel(page)).toBeVisible();
    const all = (await page.locator('body').innerText()) + (await page.content());
    for (const needle of [
      'SECRET',
      'ENOENT',
      'ssh',
      'onerror',
      'onmouseover',
      'DROP TABLE',
      'Traceback',
      'abc123',
      'postgres',
      'stack trace',
      'xxxxxxxxxx',
    ])
      expect(all, `${id} leaks ${needle}`).not.toContain(needle);
    await page.keyboard.press('Escape');
    await frames(page, 1500);
  }
  expect(await page.locator('img[src="x"], [onerror], [onmouseover]').count()).toBe(0);
});

test('draw calls: labels and panel add none', async ({ page }) => {
  await open(page);
  const calls = () => page.evaluate(() => window.__hideoutStats?.calls ?? 0);
  const base = await calls();
  await tapRoom(page, 'chrollo');
  await frames(page, 800);
  const withPanel = await calls();
  console.log(`[draw calls] default ${base}, panel open ${withPanel}`);
  expect(withPanel).toBeLessThan(DRAW_CALL_BUDGET);
  expect(withPanel, 'zoomed in culls, never adds').toBeLessThanOrEqual(base);
});
