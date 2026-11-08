import { CUE_GAP_MS, type Cue } from '../src/audio/cues';
import { demoFeedAt, DEMO_STEP_MS } from '../src/feed/demo';
import type { FeedEvent } from '../src/feed/types';
import { expect, test } from './support/fixtures';
import type { Locator, Page, TestInfo } from '@playwright/test';

// Ticket 7 (sound). The Web Audio API is spied on from an init script, so the
// tests see which contexts and oscillators the page creates without needing to
// hear anything. Time is driven by page.clock; the demo feed is deterministic
// for (seed, origin), so the cue expected at every step is computed here from
// the same demoFeedAt the page runs.
const ORIGIN = Date.parse('2026-11-08T12:00:00Z');
const SEED = 1;
const DEMO = `demo=1&seed=${SEED}&origin=${ORIGIN}`;
const SHA = 'a'.repeat(40);
const CORS = { 'access-control-allow-origin': '*' };
const STORAGE_KEY = 'hideout:sound';

type Spy = { ctxs: AudioContext[]; starts: number[] };
declare global {
  interface Window {
    __audio?: Spy;
    __hidden?: boolean;
  }
}

/** Frequencies of the cue notes (ambient oscillators use other values). */
const NOTES: Record<Cue, number[]> = { start: [523.25], done: [783.99, 1174.66] };
const CHIME_HZ = [...NOTES.start, ...NOTES.done];

/** Records every AudioContext and every oscillator start (with its frequency). */
function installAudioSpy() {
  const spy: Spy = { ctxs: [], starts: [] };
  window.__audio = spy;
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(options?: AudioContextOptions) {
      super(options);
      spy.ctxs.push(this);
    }
  };
  const start = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (this: OscillatorNode, when?: number) {
    spy.starts.push(this.frequency.value);
    start.call(this, when);
  };
}

/** Lets a test flip document.hidden / visibilityState and fire visibilitychange. */
function installFakeVisibility() {
  window.__hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (window.__hidden ? 'hidden' : 'visible'),
  });
}

const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((h) => {
    window.__hidden = h;
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

const contextCount = (page: Page) => page.evaluate(() => window.__audio?.ctxs.length ?? -1);
const contextStates = (page: Page) =>
  page.evaluate(() => window.__audio?.ctxs.map((c) => c.state) ?? []);
const oscillatorCount = (page: Page) => page.evaluate(() => window.__audio?.starts.length ?? -1);
/** The cue notes played so far, in order (ambient oscillators filtered out). */
const chimes = (page: Page) =>
  page.evaluate((hz) => {
    const round = (f: number) => Math.round(f * 100) / 100;
    return (window.__audio?.starts ?? []).map(round).filter((f) => hz.includes(f));
  }, CHIME_HZ);

const toggleOf = (page: Page) => page.getByRole('button', { name: /^Sound (on|off)$/ });
const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);

/**
 * Loads the demo with the clock running until the scene is ready (the boot
 * overlay covers the page until then), then pauses it inside a demo step, so
 * steps only advance when the test says so. `step` is the step it is paused in.
 * `slow` makes performance.now run at a quarter speed (see the rate limit test).
 */
let step = 0;
async function bootDemo(page: Page, slow = false) {
  await page.clock.install({ time: ORIGIN });
  if (slow) {
    await page.addInitScript(() => {
      const now = performance.now.bind(performance);
      performance.now = () => now() / 4;
    });
  }
  await page.goto(`./?${DEMO}`);
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'ready');
  await expect(toggleOf(page)).toBeVisible();
  const now = await page.evaluate(() => Date.now());
  step = Math.floor((now - ORIGIN) / DEMO_STEP_MS) + 1;
  await page.clock.pauseAt(ORIGIN + step * DEMO_STEP_MS + 1000);
}

/**
 * Waits until the engine has fully muted (it suspends the context a moment after fading out).
 * The suspend timer only exists once the engine chunk has handled the click, so keep nudging
 * the clock; re-reads the demo step afterwards because the nudges move time.
 */
async function expectSuspended(page: Page, message: string) {
  await expect
    .poll(
      async () => {
        await page.clock.fastForward(300);
        return contextStates(page);
      },
      { message },
    )
    .not.toContain('running');
  step = Math.floor(((await page.evaluate(() => Date.now())) - ORIGIN) / DEMO_STEP_MS);
}

/** Moves the demo to `to`, one step per timer so every step is its own feed update. */
async function advanceTo(page: Page, to: number) {
  while (step < to) {
    await page.clock.fastForward(DEMO_STEP_MS);
    step++;
  }
}

const keyOf = (e: FeedEvent) => `${e.at}|${e.who}|${e.kind}`;
/** The cue a listener who saw step `from` should get at step `to` (done beats start). */
function cueBetween(from: number, to: number): Cue | null {
  const seen = new Set(demoFeedAt(from, SEED, ORIGIN).events.map(keyOf));
  const fresh = demoFeedAt(to, SEED, ORIGIN).events.filter((e) => !seen.has(keyOf(e)));
  if (fresh.some((e) => e.kind === 'done')) return 'done';
  return fresh.some((e) => e.kind === 'start') ? 'start' : null;
}
/** The first step after the current one for which `want` holds. */
const firstStep = (want: (k: number) => boolean) => {
  for (let k = step + 1; k < step + 60; k++) if (want(k)) return k;
  throw new Error('no such demo step');
};

test.describe('off by default', () => {
  test('no AudioContext and no audio chunk until the toggle is clicked', async ({ page }) => {
    await page.addInitScript(installAudioSpy);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await bootDemo(page);
    // Let everything lazy load (scene chunk included) and some demo time pass.
    await page.clock.fastForward(8000);
    await page.waitForLoadState('networkidle');
    const toggle = toggleOf(page);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveAccessibleName('Sound off');
    expect(await contextCount(page)).toBe(0);
    expect(await oscillatorCount(page)).toBe(0);
    expect(requests.filter((u) => /engine-[\w-]+\.js/.test(u))).toEqual([]);
    expect(await stored(page)).toBeNull();

    await toggle.click();
    await expect.poll(() => contextCount(page)).toBe(1);
    expect(requests.filter((u) => /engine-[\w-]+\.js/.test(u))).toHaveLength(1);
  });

  test('the entry bundle holds no audio code', async ({ page }) => {
    const scripts: string[] = [];
    page.on('response', async (r) => {
      if (r.request().resourceType() === 'script') scripts.push(await r.text().catch(() => ''));
    });
    await bootDemo(page);
    await page.waitForLoadState('networkidle');
    const entry = scripts.filter((s) => s.includes('hideout:sound'));
    expect(entry.length).toBeGreaterThan(0);
    for (const s of entry) expect(s).not.toContain('createOscillator');
  });
});

test.describe('toggle', () => {
  test('turns sound on and off with state, name and ambient loop', async ({ page }) => {
    await page.addInitScript(installAudioSpy);
    await bootDemo(page);
    const toggle = toggleOf(page);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveAccessibleName('Sound on');
    await expect(page.getByRole('button', { name: 'Sound off' })).toHaveCount(0);
    expect(await stored(page)).toBe('on');
    // The ambient loop: four drone oscillators and one slow LFO, and no chime yet.
    await expect.poll(() => oscillatorCount(page)).toBe(5);
    expect(await chimes(page)).toEqual([]);
    await expect.poll(() => contextStates(page)).toEqual(['running']);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveAccessibleName('Sound off');
    expect(await stored(page)).toBe('off');
    await expectSuspended(page, 'context still running after mute');
    expect(await contextStates(page)).toEqual(['suspended']);

    // Back on: the same context resumes, no second context and no second drone.
    await toggle.click();
    await expect.poll(() => contextStates(page)).toEqual(['running']);
    expect(await contextCount(page)).toBe(1);
    expect(await oscillatorCount(page)).toBe(5);
  });

  test('is a real button, reachable and operable by keyboard with a visible focus ring', async ({
    page,
  }) => {
    await page.addInitScript(installAudioSpy);
    await bootDemo(page);
    const toggle = toggleOf(page);
    expect(await toggle.evaluate((el) => el.tagName)).toBe('BUTTON');

    let reached = false;
    for (let i = 0; i < 25 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await toggle.evaluate((el) => el === document.activeElement);
    }
    expect(reached, 'Tab reaches the toggle').toBe(true);
    const ring = await toggle.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        focusVisible: el.matches(':focus-visible'),
        style: s.outlineStyle,
        width: Number.parseFloat(s.outlineWidth),
        color: s.outlineColor,
      };
    });
    expect(ring.focusVisible).toBe(true);
    expect(ring.style).not.toBe('none');
    expect(ring.width).toBeGreaterThanOrEqual(2);
    expect(ring.color).not.toBe('rgba(0, 0, 0, 0)');

    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toBeFocused();
    expect(await stored(page)).toBe('off');
  });

  for (const reducedMotion of ['reduce', 'no-preference'] as const) {
    test(`no animation or transition on the toggle (${reducedMotion})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await bootDemo(page);
      const toggle = toggleOf(page);
      const motion = () =>
        toggle.evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            animation: s.animationName,
            transition: Number.parseFloat(s.transitionDuration),
          };
        });
      expect(await motion()).toEqual({ animation: 'none', transition: 0 });
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      expect(await motion()).toEqual({ animation: 'none', transition: 0 });
      expect(await toggle.evaluate((el) => el.getAnimations().length)).toBe(0);
    });
  }
});

test.describe('remembered choice', () => {
  test('survives a reload: shown on, but audio waits for the first gesture', async ({ page }) => {
    await page.addInitScript(installAudioSpy);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await bootDemo(page);
    await toggleOf(page).click();
    await expect.poll(() => contextCount(page)).toBe(1);
    expect(await stored(page)).toBe('on');

    requests.length = 0;
    await page.reload();
    await expect(toggleOf(page)).toBeVisible();
    await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(toggleOf(page)).toHaveAccessibleName('Sound on');
    await page.waitForLoadState('networkidle');
    // Autoplay policy: nothing audio-related before a gesture.
    expect(await contextCount(page)).toBe(0);
    expect(requests.filter((u) => /engine-[\w-]+\.js/.test(u))).toEqual([]);

    // The first gesture anywhere starts it, and old events do not chime.
    await page.mouse.click(300, 300);
    await expect.poll(() => contextCount(page)).toBe(1);
    await expect.poll(() => oscillatorCount(page)).toBe(5);
    await expect.poll(() => contextStates(page)).toEqual(['running']);
    expect(await chimes(page)).toEqual([]);
    await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('turning it off is remembered too', async ({ page }) => {
    await page.addInitScript(installAudioSpy);
    await bootDemo(page);
    await toggleOf(page).click();
    await toggleOf(page).click();
    await page.reload();
    await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'false');
    await page.mouse.click(300, 300);
    await page.waitForLoadState('networkidle');
    expect(await contextCount(page)).toBe(0);
  });

  test('the first click after reload on the toggle itself mutes it and stays muted', async ({
    page,
  }) => {
    // The arming listener (first gesture) and the click handler both reach the engine
    // asynchronously, so repeat the sequence: a race shows up as a context that is still
    // running although the button says "Sound off".
    await page.addInitScript(installAudioSpy);
    await bootDemo(page);
    await toggleOf(page).click();
    await expect.poll(() => contextCount(page)).toBe(1);
    await page.clock.resume();
    for (let round = 1; round <= 6; round++) {
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-scene', 'ready');
      await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'true');
      await toggleOf(page).click();
      await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'false');
      expect(await stored(page), `round ${round}`).toBe('off');
      await expectSuspended(page, `round ${round}: context still running`);
      // Back on for the next round.
      await toggleOf(page).click();
      await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => contextStates(page)).toEqual(['running']);
    }
  });

  test('blocked localStorage does not break the page', async ({ page, consoleErrors }) => {
    consoleErrors.allow(/Failed to load resource|ERR_|WebGL|GPU stall/i);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('denied', 'SecurityError');
        },
      });
    });
    await page.addInitScript(installAudioSpy);
    await bootDemo(page);
    const toggle = toggleOf(page);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    // The choice still works for this page view.
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => contextCount(page)).toBe(1);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    // And the rest of the page is alive.
    await expect(page.getByRole('region', { name: 'Active missions' })).toBeVisible();
  });
});

test.describe('cues', () => {
  test('chime for new working events, brighter for done, none for the ones present on load', async ({
    page,
  }) => {
    await page.addInitScript(installAudioSpy);
    await bootDemo(page);
    await advanceTo(page, step + 1);
    // This step already holds a long history of events; turning sound on stays silent.
    expect(demoFeedAt(step, SEED, ORIGIN).events.length).toBeGreaterThan(0);
    await toggleOf(page).click();
    await expect.poll(() => oscillatorCount(page)).toBe(5);
    expect(await chimes(page)).toEqual([]);

    // Each demo step is 4 s (> the rate limit), so every step with a cue chimes once.
    const expected: number[] = [];
    const kinds = new Set<Cue>();
    for (let i = 0; i < 15; i++) {
      const from = step;
      await advanceTo(page, from + 1);
      const cue = cueBetween(from, step);
      if (cue) {
        expected.push(...NOTES[cue]);
        kinds.add(cue);
      }
      await expect.poll(() => chimes(page)).toEqual(expected);
    }
    // Every demo step has a 'done' next to any 'start', and done wins: only the live
    // feed test below can hear the single 'start' note.
    expect([...kinds]).toEqual(['done']);
    // 'start' is a single soft note, 'done' a brighter two-note chime.
    expect(Math.max(...NOTES.start)).toBeLessThan(Math.min(...NOTES.done));
  });

  test('a burst of events in one update is a single cue', async ({ page }) => {
    await page.addInitScript(installAudioSpy);
    await bootDemo(page);
    await toggleOf(page).click();
    await expect.poll(() => oscillatorCount(page)).toBe(5);
    // fastForward jumps five steps in one update: several new start/done events at once.
    const cue = cueBetween(step, step + 5);
    expect(cue).not.toBeNull();
    await page.clock.fastForward(5 * DEMO_STEP_MS);
    await expect(page.getByText('Updated')).toBeVisible();
    await expect.poll(() => chimes(page)).toEqual(NOTES[cue ?? 'start']);
    await page.clock.fastForward(100);
    expect(await chimes(page)).toEqual(NOTES[cue ?? 'start']);
  });

  test('cues are rate limited: updates closer than the gap do not stack', async ({ page }) => {
    // Page time runs at a quarter speed for the engine's clock, so the 4 s demo
    // steps look 1 s apart to the rate limiter (limit 1.5 s).
    await page.addInitScript(installAudioSpy);
    await bootDemo(page, true);
    await toggleOf(page).click();
    await expect.poll(() => oscillatorCount(page)).toBe(5);

    const stepGapMs = DEMO_STEP_MS / 4;
    expect(stepGapMs).toBeLessThan(CUE_GAP_MS);
    const expected: number[] = [];
    let last = -Infinity;
    let suppressed = 0;
    for (let i = 1; i <= 14; i++) {
      await advanceTo(page, step + 1);
      const cue = cueBetween(step - 1, step);
      if (!cue) continue;
      if (i * stepGapMs - last >= CUE_GAP_MS) {
        last = i * stepGapMs;
        expected.push(...NOTES[cue]);
      } else suppressed++;
      await expect.poll(() => chimes(page)).toEqual(expected);
    }
    expect(suppressed, 'the scenario contains a suppressed cue').toBeGreaterThan(0);
    expect(expected.length).toBeGreaterThan(0);
  });

  test('no cues while sound is off, and none for what happened meanwhile when it comes back', async ({
    page,
  }) => {
    await page.addInitScript(installAudioSpy);
    await bootDemo(page);
    await advanceTo(page, step + 1);
    await toggleOf(page).click();
    await expect.poll(() => oscillatorCount(page)).toBe(5);
    await toggleOf(page).click();
    await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'false');
    await expectSuspended(page, 'context still running after mute');
    const missed = firstStep((k) => cueBetween(step, k) !== null);
    await advanceTo(page, missed + 1);
    expect(await chimes(page)).toEqual([]);
    await toggleOf(page).click();
    await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'true');
    await page.clock.fastForward(200);
    expect(await chimes(page)).toEqual([]);
    // After the next real update it chimes again.
    const next = firstStep((k) => cueBetween(k - 1, k) !== null);
    await advanceTo(page, next);
    await expect.poll(async () => (await chimes(page)).length).toBeGreaterThan(0);
  });

  test('the same behaviour with a live feed gaining events after load', async ({ page }) => {
    const events: object[] = [];
    let sha = 0;
    const doc = () => ({
      version: 1,
      updatedAt: new Date(ORIGIN + sha * 1000).toISOString(),
      missions: [],
      members: {},
      events,
    });
    await page.route('**/api.github.com/**', (r) =>
      r.fulfill({ status: 200, headers: CORS, body: String(sha).padStart(40, SHA[0]) }),
    );
    await page.route('**/raw.githubusercontent.com/**', (r) =>
      r.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify(doc()),
      }),
    );
    events.push({ at: new Date(ORIGIN - 60_000).toISOString(), who: 'feitan', kind: 'done' });
    await page.addInitScript(installAudioSpy);
    await page.clock.install({ time: ORIGIN });
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'ready');
    await expect(page.getByText('Updated')).toBeVisible();
    await toggleOf(page).click();
    await expect.poll(() => oscillatorCount(page)).toBe(5);
    expect(await chimes(page)).toEqual([]);

    sha = 1;
    events.unshift({ at: new Date(ORIGIN + 5000).toISOString(), who: 'machi', kind: 'start' });
    await page.clock.fastForward(35_000);
    await expect.poll(() => chimes(page)).toEqual(NOTES.start);

    sha = 2;
    events.unshift({ at: new Date(ORIGIN + 40_000).toISOString(), who: 'machi', kind: 'done' });
    await page.clock.fastForward(35_000);
    await expect.poll(() => chimes(page)).toEqual([...NOTES.start, ...NOTES.done]);
  });
});

test.describe('page visibility', () => {
  test('the context is suspended while the page is hidden and resumes when visible', async ({
    page,
  }) => {
    await page.addInitScript(installFakeVisibility);
    await page.addInitScript(installAudioSpy);
    await bootDemo(page);
    await toggleOf(page).click();
    await expect.poll(() => contextStates(page)).toEqual(['running']);

    await setHidden(page, true);
    await page.clock.fastForward(400);
    await expect.poll(() => contextStates(page)).toEqual(['suspended']);
    // Hidden with sound still "on": the button still says so.
    await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'true');

    await setHidden(page, false);
    await expect.poll(() => contextStates(page)).toEqual(['running']);
  });

  test('a page hidden before the first click never leaves a running context', async ({ page }) => {
    await page.addInitScript(installFakeVisibility);
    await page.addInitScript(installAudioSpy);
    await bootDemo(page);
    await toggleOf(page).click();
    await setHidden(page, true);
    await page.clock.fastForward(400);
    await setHidden(page, false);
    await setHidden(page, true);
    await page.clock.fastForward(400);
    await expect.poll(() => contextStates(page)).toEqual(['suspended']);
  });
});

test.describe('phone portrait layout', () => {
  test.use({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2.625,
  });

  type Box = { x: number; y: number; width: number; height: number };
  const boxOf = async (l: Locator): Promise<Box> => {
    const b = await l.boundingBox();
    if (!b) throw new Error('element has no box');
    return b;
  };
  const overlaps = (a: Box, b: Box) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  /** Saved next to the test output and attached to the report, to be looked at. */
  async function shot(page: Page, testInfo: TestInfo, name: string) {
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path });
    await testInfo.attach(name, { path, contentType: 'image/png' });
  }

  async function expectClear(page: Page, label: string) {
    const toggle = await boxOf(toggleOf(page));
    const viewport = page.viewportSize();
    expect(toggle.width, `${label}: touch target width`).toBeGreaterThanOrEqual(44);
    expect(toggle.height, `${label}: touch target height`).toBeGreaterThanOrEqual(44);
    expect(toggle.x).toBeGreaterThanOrEqual(0);
    expect(toggle.x + toggle.width).toBeLessThanOrEqual(viewport?.width ?? 0);
    const others: [string, Locator][] = [
      ['banner', page.getByRole('region', { name: 'Active missions' })],
      ['ticker', page.locator('details.ov-ticker')],
      ['footer', page.locator('footer')],
    ];
    for (const [name, loc] of others) {
      if ((await loc.count()) === 0) continue;
      expect(overlaps(toggle, await boxOf(loc)), `${label}: toggle overlaps ${name}`).toBe(false);
    }
  }

  test('does not overlap banner, ticker or footer (demo missions)', async ({ page }, testInfo) => {
    await bootDemo(page);
    await expect(page.getByRole('region', { name: 'Active missions' })).toBeVisible();
    await expectClear(page, '412x915');
    await shot(page, testInfo, 'phone-demo');
    await page.locator('details.ov-ticker summary').click();
    await expectClear(page, '412x915 ticker open');
    await page.setViewportSize({ width: 360, height: 640 });
    await expectClear(page, '360x640');
    await shot(page, testInfo, 'phone-small-ticker-open');
  });

  test('does not overlap a long, three-mission banner', async ({ page }, testInfo) => {
    const mission = (codename: string) => ({
      codename,
      state: 'active',
      startedAt: new Date(ORIGIN - 3_600_000).toISOString(),
      tickets: { done: 10, total: 10 },
    });
    await page.route('**/api.github.com/**', (r) =>
      r.fulfill({ status: 200, headers: CORS, body: SHA }),
    );
    await page.route('**/raw.githubusercontent.com/**', (r) =>
      r.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify({
          version: 1,
          updatedAt: new Date(ORIGIN).toISOString(),
          missions: [
            mission('Extraordinarily Magnificent Luminescent'),
            mission('Incomprehensibilities Overwhelmingly Unfathomable'),
            mission('Silk Lantern'),
          ],
          members: {},
          events: [],
        }),
      }),
    );
    await page.clock.install({ time: ORIGIN });
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'ready');
    const banner = page.getByRole('region', { name: 'Active missions' });
    await expect(banner).toBeVisible();
    await expect(banner.getByText(/Luminescent/)).toBeVisible();
    await shot(page, testInfo, 'phone-long-banner');
    await expectClear(page, 'long banner 412x915');
    await page.setViewportSize({ width: 360, height: 640 });
    await expectClear(page, 'long banner 360x640');
  });
});
