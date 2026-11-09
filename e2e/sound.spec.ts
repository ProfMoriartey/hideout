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
/** 6 drones + 1 LFO + 2 confirmation notes, all started by the unmute tap. */
const AMBIENT_AND_CONFIRM = 9;
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

const toggleOf = (page: Page) => page.getByRole('button', { name: 'Sound', exact: true });
const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);

/**
 * Loads the demo with the clock running until the scene is ready (the boot
 * overlay covers the page until then), then pauses it inside a demo step, so
 * steps only advance when the test says so. `step` is the step it is paused in.
 * `slow` divides performance.now by that factor (see the rate limit tests).
 */
let step = 0;
async function bootDemo(page: Page, slow = 1) {
  await page.clock.install({ time: ORIGIN });
  if (slow > 1) {
    await page.addInitScript((factor) => {
      const now = performance.now.bind(performance);
      performance.now = () => now() / factor;
    }, slow);
  }
  await page.goto(`./?${DEMO}`);
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'ready');
  await expect(toggleOf(page)).toBeVisible();
  const now = await page.evaluate(() => Date.now());
  step = Math.floor((now - ORIGIN) / DEMO_STEP_MS) + 1;
  await page.clock.pauseAt(ORIGIN + step * DEMO_STEP_MS + 1000);
}

/**
 * Waits until the engine has fully muted, after a mute or a hide (it suspends the context a moment after fading out).
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
    await expect(toggle).toHaveAccessibleName('Sound');
    expect(await contextCount(page)).toBe(0);
    expect(await oscillatorCount(page)).toBe(0);
    expect(requests.filter((u) => /engine-[\w-]+\.js/.test(u))).toEqual([]);
    expect(await stored(page)).toBeNull();

    await toggle.click();
    await expect.poll(() => contextCount(page)).toBe(1);
    // The request event can reach the test after the page has already created the context.
    await expect.poll(() => requests.filter((u) => /engine-[\w-]+\.js/.test(u)).length).toBe(1);
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
    await expect(toggle).toHaveAccessibleName('Sound');
    await expect(page.getByRole('button', { name: /^Sound (on|off)$/ })).toHaveCount(0);
    expect(await stored(page)).toBe('on');
    // The ambient loop: six drone oscillators, one slow LFO and the two-note tap confirmation, and no feed chime yet.
    await expect.poll(() => oscillatorCount(page)).toBe(AMBIENT_AND_CONFIRM);
    expect(await chimes(page)).toEqual([]);
    await expect.poll(() => contextStates(page)).toEqual(['running']);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveAccessibleName('Sound');
    expect(await stored(page)).toBe('off');
    await expectSuspended(page, 'context still running after mute');
    expect(await contextStates(page)).toEqual(['suspended']);

    // Back on: the same context resumes, no second context and no second drone.
    await toggle.click();
    await expect.poll(() => contextStates(page)).toEqual(['running']);
    expect(await contextCount(page)).toBe(1);
    expect(await oscillatorCount(page)).toBe(AMBIENT_AND_CONFIRM + 2); // turning it on again confirms again
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
  test('survives a reload: shown on, audio starts only with the first click on the toggle', async ({
    page,
  }) => {
    await page.addInitScript(installAudioSpy);
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await bootDemo(page);
    await toggleOf(page).click();
    await expect.poll(() => contextCount(page)).toBe(1);
    expect(await stored(page)).toBe('on');

    requests.length = 0;
    await page.clock.resume();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'ready');
    await expect(toggleOf(page)).toBeVisible();
    await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(toggleOf(page)).toHaveAccessibleName('Sound');
    await page.waitForLoadState('networkidle');
    const engineRequests = () => requests.filter((u) => /engine-[\w-]+\.js/.test(u));
    expect(await contextCount(page)).toBe(0);
    expect(engineRequests()).toEqual([]);

    // A gesture elsewhere on the page (pointer and keyboard) must not start anything.
    await page.mouse.click(300, 300);
    await page.keyboard.press('a');
    await page.waitForTimeout(500);
    expect(await contextCount(page)).toBe(0);
    expect(engineRequests()).toEqual([]);
    await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'true');

    // The first click on the toggle starts audio and keeps it on; old events do not chime.
    await toggleOf(page).click();
    await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => contextCount(page)).toBe(1);
    await expect.poll(() => oscillatorCount(page)).toBe(AMBIENT_AND_CONFIRM);
    await expect.poll(() => contextStates(page)).toEqual(['running']);
    expect(await chimes(page)).toEqual([]);
    expect(await stored(page)).toBe('on');
    expect(engineRequests()).toHaveLength(1);

    // Later clicks flip it as usual.
    await toggleOf(page).click();
    await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'false');
    expect(await stored(page)).toBe('off');
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

  test('after a reload the first click keeps sound on, the second mutes it (repeated)', async ({
    page,
  }) => {
    await page.addInitScript(installAudioSpy);
    await bootDemo(page);
    await toggleOf(page).click();
    await expect.poll(() => contextCount(page)).toBe(1);
    await page.clock.resume();
    for (let round = 1; round <= 4; round++) {
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-scene', 'ready');
      await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'true');
      expect(await contextCount(page), `round ${round}`).toBe(0);
      await toggleOf(page).click();
      await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'true');
      await expect
        .poll(() => contextStates(page), { message: `round ${round}` })
        .toEqual(['running']);
      expect(await stored(page)).toBe('on');
      await toggleOf(page).click();
      await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'false');
      expect(await stored(page), `round ${round}`).toBe('off');
      await expectSuspended(page, `round ${round}: context still running`);
      // Back on for the next round's reload.
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
    await expect.poll(() => oscillatorCount(page)).toBe(AMBIENT_AND_CONFIRM);
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
    await expect.poll(() => oscillatorCount(page)).toBe(AMBIENT_AND_CONFIRM);
    // fastForward jumps five steps in one update: several new start/done events at once.
    const cue = cueBetween(step, step + 5);
    expect(cue).not.toBeNull();
    await page.clock.fastForward(5 * DEMO_STEP_MS);
    await expect(page.getByText('Updated')).toBeVisible();
    await expect.poll(() => chimes(page)).toEqual(NOTES[cue ?? 'start']);
    await page.clock.fastForward(100);
    expect(await chimes(page)).toEqual(NOTES[cue ?? 'start']);
  });

  test('a done cue is never held back by the rate limit', async ({ page }) => {
    // The engine's clock runs at a quarter speed, so the 4 s demo steps look 1 s
    // apart to the rate limiter (gap 1.5 s). Every demo step has a done, which
    // bypasses the gap, so every step still chimes.
    await page.addInitScript(installAudioSpy);
    await bootDemo(page, 4);
    await toggleOf(page).click();
    await expect.poll(() => oscillatorCount(page)).toBe(AMBIENT_AND_CONFIRM);
    expect(DEMO_STEP_MS / 4).toBeLessThan(CUE_GAP_MS);
    const expected: number[] = [];
    for (let i = 0; i < 6; i++) {
      await advanceTo(page, step + 1);
      const cue = cueBetween(step - 1, step);
      expect(cue).toBe('done');
      expected.push(...NOTES.done);
      await expect.poll(() => chimes(page)).toEqual(expected);
    }
  });

  test('start cues are rate limited, done cues are not', async ({ page }) => {
    // Live feed polled every 30 s; the engine's clock runs 100x slower, so a poll
    // looks 0.3 s after the previous one (gap 1.5 s).
    const events: object[] = [];
    let sha = 0;
    let rawHits = 0;
    await page.route('**/api.github.com/**', (r) =>
      r.fulfill({ status: 200, headers: CORS, body: String(sha).padStart(40, 'a') }),
    );
    await page.route('**/raw.githubusercontent.com/**', (r) => {
      rawHits++;
      return r.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify({
          version: 1,
          updatedAt: new Date(ORIGIN + sha * 1000).toISOString(),
          missions: [],
          members: {},
          events,
        }),
      });
    });
    await page.addInitScript(installAudioSpy);
    await page.clock.install({ time: ORIGIN });
    await page.addInitScript(() => {
      const now = performance.now.bind(performance);
      performance.now = () => now() / 100;
    });
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('data-scene', 'ready');
    await expect(page.getByText('Updated')).toBeVisible();
    await toggleOf(page).click();
    await expect.poll(() => oscillatorCount(page)).toBe(AMBIENT_AND_CONFIRM);

    let n = 0;
    /** One poll cycle, optionally with a new event. */
    const poll = async (who: 'machi' | 'kortopi' | 'feitan' | null, kind: 'start' | 'done') => {
      n++;
      sha = n;
      if (who) events.unshift({ at: new Date(ORIGIN + n * 1000).toISOString(), who, kind });
      const before = rawHits;
      await page.clock.fastForward(35_000);
      await expect.poll(() => rawHits).toBeGreaterThan(before);
      await page.waitForTimeout(150);
    };
    await poll('machi', 'start');
    expect(await chimes(page), 'first start chimes').toEqual(NOTES.start);
    await poll('kortopi', 'start');
    expect(await chimes(page), 'start within the gap is dropped').toEqual(NOTES.start);
    await poll('feitan', 'done');
    expect(await chimes(page), 'done within the gap still plays').toEqual([
      ...NOTES.start,
      ...NOTES.done,
    ]);
    await poll('machi', 'start');
    expect(await chimes(page), 'start right after a done is dropped').toHaveLength(3);
    for (let i = 0; i < 6; i++) await poll(null, 'start');
    await poll('kortopi', 'start');
    expect(await chimes(page), 'start after the gap plays again').toEqual([
      ...NOTES.start,
      ...NOTES.done,
      ...NOTES.start,
    ]);
  });

  test('no cues while sound is off, and none for what happened meanwhile when it comes back', async ({
    page,
  }) => {
    await page.addInitScript(installAudioSpy);
    await bootDemo(page);
    await advanceTo(page, step + 1);
    await toggleOf(page).click();
    await expect.poll(() => oscillatorCount(page)).toBe(AMBIENT_AND_CONFIRM);
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
    await expect.poll(() => oscillatorCount(page)).toBe(AMBIENT_AND_CONFIRM);
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

test.describe('audible output', () => {
  // The tap must produce real, non-silent samples at the destination (an analyser
  // is spliced in front of it), not only create nodes.
  test('after the tap the context runs and the output is not silent', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __an?: AnalyserNode };
      const connect = AudioNode.prototype.connect as (...a: unknown[]) => unknown;
      AudioNode.prototype.connect = function (this: AudioNode, ...a: unknown[]) {
        const target = a[0];
        if (target instanceof AudioDestinationNode) {
          w.__an ??= target.context.createAnalyser();
          connect.call(this, w.__an);
        }
        return connect.apply(this, a);
      } as typeof AudioNode.prototype.connect;
    });
    await page.addInitScript(installAudioSpy);
    await bootDemo(page);
    await toggleOf(page).click();
    await expect.poll(() => contextStates(page)).toEqual(['running']);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const an = (window as unknown as { __an?: AnalyserNode }).__an;
          if (!an) return 0;
          const d = new Float32Array(an.fftSize);
          an.getFloatTimeDomainData(d);
          return d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
        }),
      )
      .toBeGreaterThan(0.01);
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
    // The suspend timer exists only once the engine has handled the change; nudge until it ran.
    await expectSuspended(page, 'context still running while hidden');
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
    await expectSuspended(page, 'context still running while hidden');
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
