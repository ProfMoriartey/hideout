import { MEMBERS } from '../src/config/members';
import { demoFeedAt, DEMO_STEP_MS } from '../src/feed/demo';
import { displayState, type DisplayState } from '../src/feed/derive';
import type { MemberId } from '../src/feed/types';
import { expect, sceneReady, test } from './support/fixtures';
import type { Page } from '@playwright/test';

// Ticket 4 (members and animations), driven by ?demo=1 under a fake clock.
//
// page.clock fakes performance.now and requestAnimationFrame, so the render
// loop only advances when the test advances the clock. `runFor` fires a frame
// every 16 ms of fake time (what the animation levels integrate over);
// `fastForward` jumps in one go (one frame with a huge dt, which the levels
// follow straight to their target). Both are deterministic: nothing here
// depends on real time or on how fast the machine renders.
const ORIGIN = Date.parse('2026-11-08T12:00:00Z');
const SEED = 3;
const FRAME_MS = 16;
const DRAW_CALL_BUDGET = 60;
// Mirrors src/scene/members/levels.ts (a test that restated the formulas would prove nothing).
const IDLE_LIGHT = 0.42;
const STATIC_GLOW = 0.5;

type Levels = Record<'work' | 'light' | 'celebrate' | 'stale', number[]> & {
  display: DisplayState[];
};
type Spy = {
  castMembers: number[];
  sparkMembers: number[];
  castProgram: boolean;
  sparkProgram: boolean;
  pointDraws: number;
};

const stepStart = (step: number) => ORIGIN + step * DEMO_STEP_MS;

function expectedAt(step: number, offsetMs = 100): DisplayState[] {
  const feed = demoFeedAt(step, SEED, ORIGIN);
  return MEMBERS.map((m) =>
    displayState(feed.members[m.id as MemberId], stepStart(step) + offsetMs),
  );
}

/** Steps 1..10 are one full demo cycle, whatever the seed (step 0 is already behind us once the scene is up). */
const cycle = Array.from({ length: 10 }, (_, i) => i + 1);
const firstStepWhere = (pick: (d: DisplayState[]) => boolean) => {
  const step = cycle.find((s) => pick(expectedAt(s)));
  if (step === undefined) throw new Error('no such demo step');
  return step;
};
const count = (d: DisplayState[], state: DisplayState) => d.filter((x) => x === state).length;

test.beforeEach(async ({ page }) => {
  // Records what the page sends to WebGL: the cast's `info` and the sparks'
  // `seed` vertex buffers (member index in x), their shaders, and POINTS draws.
  await page.addInitScript(() => {
    const spy = {
      castMembers: new Set<number>(),
      sparkMembers: new Set<number>(),
      castProgram: false,
      sparkProgram: false,
      pointDraws: 0,
    };
    (window as unknown as { __spy: typeof spy }).__spy = spy;
    const proto = WebGL2RenderingContext.prototype;
    const bufferData = proto.bufferData as (...a: unknown[]) => void;
    proto.bufferData = function (...args: unknown[]) {
      const data = args[1];
      if (data instanceof Float32Array && data.length >= 400 && data.length % 4 === 0) {
        const xs = new Set<number>();
        // info = (member, light, z, w): z and w are small integer tags.
        // seed = (member, phase, cos, sin): not integer tags.
        let ints = true;
        let tags = true;
        for (let i = 0; i < data.length; i += 4) {
          const x = data[i] as number;
          if (!Number.isInteger(x) || x < 0 || x > 12) ints = false;
          xs.add(x);
          const z = data[i + 2] as number;
          const w = data[i + 3] as number;
          if (!(Number.isInteger(z) && Number.isInteger(w) && z >= 0 && z <= 2 && w >= 0 && w <= 2))
            tags = false;
        }
        if (ints && xs.size === 13)
          xs.forEach((x) => (tags ? spy.castMembers : spy.sparkMembers).add(x));
      }
      return bufferData.apply(this, args);
    };
    const shaderSource = proto.shaderSource as (s: WebGLShader, src: string) => void;
    proto.shaderSource = function (shader: WebGLShader, src: string) {
      if (src.includes('uStale') && src.includes('attribute vec4 info')) spy.castProgram = true;
      if (src.includes('attribute vec4 seed')) spy.sparkProgram = true;
      return shaderSource.call(this, shader, src);
    };
    const drawArrays = proto.drawArrays as (mode: number, a: number, b: number) => void;
    proto.drawArrays = function (mode: number, a: number, b: number) {
      if (mode === 0) spy.pointDraws++;
      return drawArrays.call(this, mode, a, b);
    };
  });
});

async function open(page: Page, seed = SEED) {
  await page.clock.install({ time: ORIGIN });
  await page.clock.pauseAt(ORIGIN + 1000);
  await page.goto(`./?demo=1&seed=${seed}&origin=${ORIGIN}`);
  // Mounting needs timers and frames: advance fake time until the scene is ready.
  for (let i = 0; i < 100; i++) {
    if ((await page.locator('html').getAttribute('data-scene')) === 'ready') break;
    await page.clock.runFor(100);
    await page.waitForTimeout(20);
  }
  await sceneReady(page);
  await expect(page.locator('canvas')).toBeVisible();
}

/**
 * Jumps to `offsetMs` past the start of `step`, then runs `settleMs` of 16 ms frames.
 * The last stretch before the target runs frame by frame, so the change of state is
 * seen by the levels the way a live one is (eased), not as one huge time step.
 */
async function goTo(page: Page, step: number, offsetMs = 100, settleMs = 1500) {
  const now = await page.evaluate(() => Date.now());
  const target = stepStart(step) + offsetMs;
  expect(target, `step ${step} is still ahead of the fake clock`).toBeGreaterThan(now);
  const lead = Math.min(FRAME_MS * 12, target - now);
  await page.clock.fastForward(target - now - lead);
  await page.clock.runFor(lead + FRAME_MS * 3);
  if (settleMs) await page.clock.runFor(settleMs);
}

const levels = (page: Page) =>
  page.evaluate(() => {
    const l = (window as unknown as { __hideoutLevels: Record<string, ArrayLike<number>> })
      .__hideoutLevels;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(l)) if (k !== 'seen') out[k] = Array.from(l[k] ?? []);
    return out as unknown as Levels;
  });
const stats = (page: Page) =>
  page.evaluate(() => {
    const s = window.__hideoutStats;
    return { calls: s?.calls ?? 0, triangles: s?.triangles ?? 0, frames: s?.frames ?? 0 };
  });
const shot = (page: Page, name: string, testInfo: { project: { name: string } }) =>
  page.screenshot({ path: `e2e/screenshots/members-${name}-${testInfo.project.name}.png` });

test('all 13 figures are in the scene, and every display matches the feed at every demo step', async ({
  page,
}) => {
  await open(page);
  const spy = await page.evaluate(() => {
    const s = (window as unknown as { __spy: Record<string, unknown> }).__spy;
    return {
      ...s,
      castMembers: [...(s.castMembers as Set<number>)].sort((a, b) => a - b),
      sparkMembers: [...(s.sparkMembers as Set<number>)].sort((a, b) => a - b),
    } as Spy;
  });
  const all = Array.from({ length: 13 }, (_, i) => i);
  expect(MEMBERS).toHaveLength(13);
  expect(spy.castMembers, 'cast vertices tagged with all 13 members').toEqual(all);
  expect(spy.sparkMembers, 'spark points tagged with all 13 members').toEqual(all);
  expect(spy.castProgram, 'cast shader compiled').toBe(true);
  expect(spy.sparkProgram, 'sparks shader compiled').toBe(true);

  for (const step of [...cycle, 11, 12]) {
    await goTo(page, step, 100, 0);
    const l = await levels(page);
    for (const k of ['display', 'work', 'light', 'celebrate', 'stale'] as const)
      expect(l[k], `${k} has 13 entries`).toHaveLength(13);
    expect(l.display, `displays at step ${step}`).toEqual(expectedAt(step));
  }
  // POINTS were really drawn (the sparks mesh), and the cast is within the budget.
  expect(
    await page.evaluate(() => (window as unknown as { __spy: Spy }).__spy.pointDraws),
  ).toBeGreaterThan(0);
  expect((await stats(page)).calls).toBeLessThan(DRAW_CALL_BUDGET);
});

test('idle, working, done and stale each look different (levels and screenshots)', async ({
  page,
}, testInfo) => {
  await open(page);
  const step = firstStepWhere((d) =>
    ['idle', 'working', 'done', 'stale'].every((s) => d.includes(s as DisplayState)),
  );
  // 250 ms into the step: the done burst is near its peak, working is settled.
  await goTo(page, step, 100, 250);
  const l = await levels(page);
  expect(l.display).toEqual(expectedAt(step));
  const at = (state: DisplayState) => {
    const i = l.display.indexOf(state);
    expect(i, state).toBeGreaterThanOrEqual(0);
    return i;
  };
  const idle = at('idle');
  const working = at('working');
  const done = at('done');
  const stale = at('stale');

  // 1.5 s on, every level has settled.
  await page.clock.runFor(1500);
  const settled = await levels(page);
  expect(settled.work[idle]).toBeCloseTo(0, 2);
  expect(settled.light[idle]).toBeCloseTo(IDLE_LIGHT, 2);
  expect(settled.celebrate[idle]).toBeLessThan(0.02);
  expect(settled.stale[idle]).toBe(0);

  expect(settled.work[working]).toBeGreaterThan(0.97);
  expect(settled.light[working]).toBeGreaterThan(0.97);
  expect(settled.stale[working]).toBe(0);

  expect(l.celebrate[done], 'burst just started').toBeGreaterThan(0.6);
  expect(l.light[done], 'burst is brighter than a lit room').toBeGreaterThan(IDLE_LIGHT + 0.5);

  // Stale: shows as idle (asleep, dim) plus the "?".
  expect(settled.stale[stale]).toBe(1);
  expect(settled.work[stale]).toBeCloseTo(0, 2);
  expect(settled.light[stale]).toBeCloseTo(IDLE_LIGHT, 2);
  expect(settled.stale.reduce((a, b) => a + b, 0)).toBe(count(l.display, 'stale'));

  // The screenshots differ per state: a lit working room is clearly brighter than an idle one.
  await shot(page, 'states', testInfo);
});

test('done celebrates for a few seconds, then the room goes back to idle', async ({
  page,
}, testInfo) => {
  await open(page);
  const step = firstStepWhere((d) => d.includes('done'));
  const i = expectedAt(step).indexOf('done');
  await goTo(page, step, 100, 200);
  const early = await levels(page);
  expect(early.display[i]).toBe('done');
  expect(early.celebrate[i]).toBeGreaterThan(0.6);
  await shot(page, 'done-burst', testInfo);

  await page.clock.runFor(1200);
  const mid = await levels(page);
  expect(mid.celebrate[i], 'decaying').toBeLessThan(early.celebrate[i] as number);
  expect(mid.celebrate[i]).toBeGreaterThan(0.1);

  // Next step: the member is idle again; the burst has died away.
  await goTo(page, step + 1, 100, 3000);
  const after = await levels(page);
  expect(after.display[i]).toBe('idle');
  expect(after.celebrate[i]).toBeLessThan(0.02);
  expect(after.work[i]).toBeCloseTo(0, 2);
  expect(after.light[i]).toBeCloseTo(IDLE_LIGHT, 1);
  await shot(page, 'after-done', testInfo);
});

test('many members work at once, and the scene stays within the draw-call budget', async ({
  page,
}, testInfo) => {
  await open(page);
  const step = firstStepWhere((d) => count(d, 'working') >= 6);
  await goTo(page, step);
  const l = await levels(page);
  const working = count(expectedAt(step), 'working');
  expect(working).toBeGreaterThanOrEqual(6);
  expect(l.work.filter((w) => w > 0.97)).toHaveLength(working);
  expect(l.light.filter((x) => x > 0.97)).toHaveLength(working);
  const s = await stats(page);
  expect(s.calls).toBeLessThan(DRAW_CALL_BUDGET);
  console.log(
    `[${testInfo.project.name}] ${working} working: draw calls ${s.calls}, triangles ${s.triangles}`,
  );
  await shot(page, 'many-working', testInfo);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('done is a static glow, work and light jump, nothing animates', async ({ page }) => {
    await open(page);
    const step = firstStepWhere((d) => d.includes('done') && d.includes('working'));
    const done = expectedAt(step).indexOf('done');
    const working = expectedAt(step).indexOf('working');
    // Only three frames after the change: reduced motion is already there, a fade would not be.
    await goTo(page, step, 100, 0);
    const a = await levels(page);
    expect(a.work[working]).toBe(1);
    expect(a.light[working]).toBe(1);
    expect(a.celebrate[done]).toBe(STATIC_GLOW);
    // No decay while the member stays done, and no motion in the picture.
    await page.clock.runFor(2000);
    const b = await levels(page);
    expect(b.celebrate[done]).toBe(STATIC_GLOW);
    const one = await page.screenshot();
    await page.clock.runFor(650);
    const two = await page.screenshot();
    expect(one.equals(two), 'two frames 650 ms apart are identical').toBe(true);
    // Next step: done is over at once, with no fade.
    await goTo(page, step + 1, 100, 0);
    expect((await levels(page)).celebrate[done]).toBe(0);
  });

  test('without reduced motion the same moment does animate (control)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page);
    const step = firstStepWhere((d) => d.includes('done') && d.includes('working'));
    const working = expectedAt(step).indexOf('working');
    await goTo(page, step, 100, 0);
    expect((await levels(page)).work[working], 'eases up, not a jump').toBeLessThan(0.9);
    await page.clock.runFor(2000);
    const one = await page.screenshot();
    await page.clock.runFor(650);
    const two = await page.screenshot();
    expect(one.equals(two), 'frames differ (breathing, loops, sparks)').toBe(false);
  });
});

test('console stays clean: only the known THREE.Clock deprecation warning (and the headless GL driver note)', async ({
  page,
}) => {
  const seen: string[] = [];
  page.on('console', (msg) => {
    if (['warning', 'error'].includes(msg.type())) seen.push(msg.text());
  });
  page.on('pageerror', (err) => seen.push(err.message));
  await open(page);
  for (const step of [2, 3, 6, 8]) await goTo(page, step, 100, 500);
  // "GPU stall due to ReadPixels" is Chrome's software-GL driver note on compositing, not the app.
  expect(
    seen.filter((t) => !/THREE\.Clock: This module has been deprecated|GL Driver Message/.test(t)),
  ).toEqual([]);
});
