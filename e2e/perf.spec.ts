import type { Page } from '@playwright/test';
import { demoFeedAt, DEMO_STEP_MS } from '../src/feed/demo';
import { MEMBERS } from '../src/config/members';
import { displayState } from '../src/feed/derive';
import type { MemberId } from '../src/feed/types';
import { expect, sceneReady, test } from './support/fixtures';

// Ticket 8: quality tiers, frame loop and context loss. Everything that depends
// on frame timing runs under page.clock, so a slow machine cannot change the
// result: `fastForward(n)` is exactly one frame that is n ms after the last,
// `runFor(n)` is n / 16 frames at 60 Hz. Renders are counted by wrapping
// `clear` (three clears once per render); window.__hideoutStats lags a frame.
//
// A small 1x screen keeps every software-rendered frame cheap; the DPR tests
// switch to a 3x one, because Playwright's desktop is 1x and would hide the caps.
test.use({ viewport: { width: 480, height: 320 }, deviceScaleFactor: 1 });

const ORIGIN = Date.parse('2026-11-08T12:00:00Z');
const SEED = 3;
/** Frames longer than this are "slow" (below the 45 fps drop line); 100 ms = 10 fps. */
const SLOW_MS = 100;
const WINDOW_FRAMES = 31; // > 3 s of SLOW_MS frames: one window, once

type Tier = 'low' | 'medium' | 'high';
const CAP: Record<Tier, number> = { low: 1, medium: 1.5, high: 2 };
const STEP_DOWN: Record<Tier, Tier> = { high: 'medium', medium: 'low', low: 'low' };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __clears: number };
    w.__clears = 0;
    const clear = WebGL2RenderingContext.prototype.clear;
    WebGL2RenderingContext.prototype.clear = function (mask: number) {
      w.__clears++;
      return clear.call(this, mask);
    };
  });
});

async function open(page: Page, demo = false) {
  await page.clock.install({ time: ORIGIN });
  await page.clock.pauseAt(ORIGIN + 1000);
  await page.goto(demo ? `./?demo=1&seed=${SEED}&origin=${ORIGIN}` : './');
  // Mounting needs timers and frames: advance fake time until the scene is ready.
  for (let i = 0; i < 100; i++) {
    if ((await page.locator('html').getAttribute('data-scene')) === 'ready') break;
    await page.clock.runFor(100);
    await page.waitForTimeout(20);
  }
  await sceneReady(page);
  await page.clock.runFor(500);
}

const renders = (page: Page) =>
  page.evaluate(() => (window as unknown as { __clears: number }).__clears);
const tier = async (page: Page) =>
  (await page.locator('html').getAttribute('data-quality')) as Tier | null;
const dpr = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? c.width / c.clientWidth : 0;
  });

/** Counts the renders made while `run` advances the fake clock. */
async function rendersDuring(page: Page, run: () => Promise<void>) {
  const before = await renders(page);
  await run();
  return (await renders(page)) - before;
}

async function slowFrames(page: Page, n: number, ms = SLOW_MS) {
  for (let i = 0; i < n; i++) await page.clock.fastForward(ms);
}

/**
 * Feeds slow frames until the tier changes (at most two windows, since the
 * window already running may be part full) and returns the tier it left.
 * Stopping at the drop keeps leftover slow frames out of the next window.
 */
async function dropOnce(page: Page) {
  const from = await tier(page);
  for (let i = 0; i < 2 * WINDOW_FRAMES && (await tier(page)) === from; i++)
    await page.clock.fastForward(SLOW_MS);
  await page.clock.runFor(100);
  return from;
}

test.describe('quality tiers', () => {
  test.describe('on a 3x screen', () => {
    test.use({ deviceScaleFactor: 3 });
    test('start high on desktop and medium on phones, with the DPR cap of that tier', async ({
      page,
    }, testInfo) => {
      await open(page);
      const start: Tier = testInfo.project.name === 'phone' ? 'medium' : 'high';
      expect(await tier(page)).toBe(start);
      await expect.poll(() => dpr(page)).toBeCloseTo(CAP[start], 1);
    });

    test('one slow window drops one tier, the DPR cap follows, and low is the floor', async ({
      page,
    }) => {
      const warnings: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'warning') warnings.push(m.text());
      });
      await open(page);
      let from = (await dropOnce(page)) as Tier;
      let now = (await tier(page)) as Tier;
      expect(now).toBe(STEP_DOWN[from]);
      await expect.poll(() => dpr(page)).toBeCloseTo(CAP[now], 1);

      // Keep going until low, then one more slow window changes nothing.
      for (let i = 0; i < 2 && now !== 'low'; i++) {
        from = (await dropOnce(page)) as Tier;
        now = (await tier(page)) as Tier;
        expect(now).toBe(STEP_DOWN[from]);
        await expect.poll(() => dpr(page)).toBeCloseTo(CAP[now], 1);
      }
      expect(now).toBe('low');
      await expect.poll(() => dpr(page)).toBeCloseTo(1, 1);
      await dropOnce(page);
      expect(await tier(page)).toBe('low');
      // Besides Chromium's own GL driver notes, the only warning is the known THREE.Clock one from R3F 8.
      expect(warnings.filter((w) => !/THREE\.Clock|GL Driver Message/.test(w))).toEqual([]);
    });
  });

  test('never bounces back up: fast frames after a drop leave the tier and DPR alone', async ({
    page,
  }) => {
    await open(page);
    await dropOnce(page);
    const after = await tier(page);
    const ratio = await dpr(page);
    await page.clock.runFor(4000); // 240 frames at 60 Hz, more than one window
    expect(await tier(page)).toBe(after);
    expect(await dpr(page)).toBeCloseTo(ratio, 1);
  });

  test('fast frames from the start never drop a tier', async ({ page }) => {
    await open(page);
    const start = await tier(page);
    await page.clock.runFor(4000);
    expect(await tier(page)).toBe(start);
  });

  test('a long frame gap (what a hidden tab leaves behind) is not counted as slow', async ({
    page,
  }) => {
    // Headless Chromium keeps every page "visible", so a really hidden tab cannot be
    // made here; this checks the half we own: one huge gap, then normal frames.
    await open(page);
    const start = await tier(page);
    await page.clock.fastForward(60_000);
    await page.clock.runFor(2500);
    expect(await tier(page)).toBe(start);
    await page.clock.fastForward(5000);
    await page.clock.runFor(2500);
    expect(await tier(page)).toBe(start);
  });

  test('a really slow CPU (6x throttle, real time) drops a tier by itself', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP throttling is Chromium only');
    test.slow();
    await page.goto('./');
    await sceneReady(page);
    const start = await tier(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await expect.poll(() => tier(page), { timeout: 40_000 }).not.toBe(start);
    expect(await tier(page)).toBe(STEP_DOWN[start as Tier]);
  });
});

test.describe('frame loop', () => {
  test('motion on: the scene keeps rendering at full rate (figures breathe)', async ({ page }) => {
    await open(page);
    const n = await rendersDuring(page, () => page.clock.runFor(1000));
    expect(n).toBeGreaterThanOrEqual(55); // 62 frames at 60 Hz
  });

  test('low tier renders at most 30 times a second, and still renders', async ({ page }) => {
    await open(page);
    for (let i = 0; i < 3 && (await tier(page)) !== 'low'; i++) await dropOnce(page);
    expect(await tier(page)).toBe('low');
    await page.clock.runFor(500);
    const n = await rendersDuring(page, () => page.clock.runFor(2000));
    expect(n).toBeGreaterThanOrEqual(50);
    expect(n).toBeLessThanOrEqual(66); // 30 fps x 2 s, with a frame or two of slack
  });

  test('a resize (rotation, URL bar) keeps the low tier: DPR 1 and the 30 fps cap', async ({
    page,
  }) => {
    // R3F re-applies the Canvas props on every resize; the tier must survive that.
    await open(page);
    for (let i = 0; i < 3 && (await tier(page)) !== 'low'; i++) await dropOnce(page);
    await page.setViewportSize({ width: 320, height: 480 });
    await page.waitForTimeout(100); // the resize observer and React run in real time
    await page.clock.runFor(500);
    expect(await tier(page)).toBe('low');
    await expect.poll(() => dpr(page)).toBeCloseTo(1, 1);
    expect(await rendersDuring(page, () => page.clock.runFor(2000))).toBeLessThanOrEqual(66);
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('a static scene stops rendering', async ({ page }) => {
      await open(page);
      await page.clock.runFor(1000);
      expect(await renders(page)).toBeGreaterThan(0); // it did draw once
      expect(await rendersDuring(page, () => page.clock.runFor(5000))).toBe(0);
    });

    test('a resize draws the new size, then the scene goes quiet again', async ({ page }) => {
      await open(page);
      await page.setViewportSize({ width: 320, height: 480 });
      await page.waitForTimeout(100);
      expect(await rendersDuring(page, () => page.clock.runFor(500))).toBeGreaterThan(0);
      expect(await rendersDuring(page, () => page.clock.runFor(3000))).toBe(0);
    });

    test('a camera move (wheel) still renders, then goes quiet again', async ({ page }) => {
      await open(page);
      const vp = page.viewportSize();
      await page.mouse.move((vp?.width ?? 800) / 2, (vp?.height ?? 600) / 2);
      const n = await rendersDuring(page, async () => {
        await page.mouse.wheel(0, -300);
        await page.clock.runFor(500);
      });
      expect(n).toBeGreaterThan(0);
      expect(await rendersDuring(page, () => page.clock.runFor(3000))).toBe(0);
    });

    test('a member changing state still renders', async ({ page }) => {
      await open(page, true);
      const shown = (step: number) =>
        MEMBERS.map((m) =>
          displayState(
            demoFeedAt(step, SEED, ORIGIN).members[m.id as MemberId],
            ORIGIN + step * DEMO_STEP_MS + 100,
          ),
        ).join();
      const step = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((s) => shown(s) !== shown(0));
      expect(step, 'a demo step that differs from step 0').toBeDefined();
      const now = await page.evaluate(() => Date.now());
      const n = await rendersDuring(page, async () => {
        await page.clock.fastForward(ORIGIN + (step ?? 1) * DEMO_STEP_MS + 100 - now);
        await page.clock.runFor(500);
      });
      expect(n).toBeGreaterThan(0);
    });

    test('switching reduced motion on and off at runtime stops and resumes the loop', async ({
      page,
    }) => {
      await open(page);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForTimeout(100); // the change event and React's effect run in real time
      await page.clock.runFor(500);
      expect(await rendersDuring(page, () => page.clock.runFor(1000))).toBeGreaterThanOrEqual(55);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(100);
      await page.clock.runFor(500);
      expect(await rendersDuring(page, () => page.clock.runFor(2000))).toBe(0);
    });

    test('the tier is not dropped by demand rendering gaps', async ({ page }) => {
      await open(page);
      const start = await tier(page);
      await page.clock.runFor(3000);
      await slowFrames(page, WINDOW_FRAMES);
      expect(await tier(page)).toBe(start);
    });
  });
});

test.describe('WebGL context loss', () => {
  test('shows a message with a focusable Reload button, and clears it on restore', async ({
    page,
    consoleErrors,
  }) => {
    consoleErrors.allow(/context/i);
    await page.goto('./');
    await sceneReady(page);
    const note = page.locator('.gl-lost');
    await expect(note).toHaveCount(0);
    const sound = page.getByRole('button', { name: 'Sound' });
    await sound.focus();

    await page.evaluate(() => {
      const gl = document.querySelector('canvas')?.getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_lose_context');
      if (!ext) throw new Error('no WEBGL_lose_context');
      (window as unknown as { __ext: WEBGL_lose_context }).__ext = ext;
      ext.loseContext();
    });
    await expect(note).toBeVisible();
    await expect(note).toHaveAttribute('role', 'alert');
    await expect(note).toContainText(/went dark/i);
    // Focus moves to Reload on its own, so a keyboard user is not left on hidden controls.
    const reload = note.getByRole('button', { name: 'Reload' });
    await expect(reload).toBeFocused();

    await page.evaluate(() =>
      (window as unknown as { __ext: WEBGL_lose_context }).__ext.restoreContext(),
    );
    await expect(note).toHaveCount(0);
    await expect(sound).toBeFocused();
    // The scene draws again after the restore.
    const before = await renders(page);
    await expect.poll(() => renders(page)).toBeGreaterThan(before + 5);
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('the Reload button reloads the page', async ({ page, consoleErrors }) => {
    consoleErrors.allow(/context/i);
    await page.goto('./');
    await sceneReady(page);
    await page.evaluate(() => {
      const ext = document
        .querySelector('canvas')
        ?.getContext('webgl2')
        ?.getExtension('WEBGL_lose_context');
      ext?.loseContext();
    });
    const reload = page.locator('.gl-lost').getByRole('button', { name: 'Reload' });
    await expect(reload).toBeVisible();
    await Promise.all([page.waitForEvent('load'), reload.click()]);
    await sceneReady(page);
    await expect(page.locator('.gl-lost')).toHaveCount(0);
  });
});
