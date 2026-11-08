import { describe, expect, it } from 'vitest';
import {
  BURST_LIGHT,
  CELEBRATE_SECONDS,
  IDLE_LIGHT,
  STATIC_GLOW,
  createLevels,
  stepLevels,
  type Levels,
} from './levels';

/** Runs `seconds` of frames at 60 fps. */
function run(l: Levels, seconds: number, reduced = false) {
  for (let t = 0; t < seconds; t += 1 / 60) stepLevels(l, 1 / 60, reduced);
}

describe('member levels', () => {
  it('starts idle: dim, idle pose, no "?"', () => {
    const l = createLevels(2);
    stepLevels(l, 1 / 60, false);
    expect(l.work[0]).toBe(0);
    expect(l.light[0]).toBeCloseTo(IDLE_LIGHT);
    expect(l.stale[0]).toBe(0);
    expect(l.celebrate[0]).toBe(0);
  });

  it('working lights the room and wakes the figure within about a second', () => {
    const l = createLevels(2);
    l.display[1] = 'working';
    run(l, 1.2);
    expect(l.work[1]).toBeGreaterThan(0.95);
    expect(l.light[1]).toBeGreaterThan(0.97);
    // Members are independent.
    expect(l.work[0]).toBe(0);
  });

  it('stale looks idle and shows the "?"', () => {
    const l = createLevels(1);
    l.display[0] = 'working';
    run(l, 2);
    l.display[0] = 'stale';
    run(l, 2);
    expect(l.stale[0]).toBe(1);
    expect(l.work[0]).toBeLessThan(0.01);
    expect(l.light[0]).toBeCloseTo(IDLE_LIGHT, 2);
    l.display[0] = 'idle';
    stepLevels(l, 1 / 60, false);
    expect(l.stale[0]).toBe(0);
  });

  it('done bursts once, then fades within the celebration time even if done lasts longer', () => {
    const l = createLevels(1);
    l.display[0] = 'working';
    run(l, 2);
    l.display[0] = 'done';
    stepLevels(l, 1 / 60, false);
    expect(l.celebrate[0]).toBeGreaterThan(0.95);
    expect(l.light[0]).toBeGreaterThan(1 + BURST_LIGHT * 0.9);
    run(l, CELEBRATE_SECONDS);
    expect(l.celebrate[0]).toBeLessThan(0.06);
    // Still `done` (the store holds it up to 8 s after a fresh load): no second burst.
    run(l, 5);
    expect(l.celebrate[0]).toBeLessThan(0.001);
    // Done -> idle -> done again does burst again.
    l.display[0] = 'idle';
    stepLevels(l, 1 / 60, false);
    l.display[0] = 'done';
    stepLevels(l, 1 / 60, false);
    expect(l.celebrate[0]).toBeGreaterThan(0.95);
  });

  it('a done already showing on load celebrates too', () => {
    const l = createLevels(1);
    l.display[0] = 'done';
    stepLevels(l, 1 / 60, false);
    expect(l.celebrate[0]).toBeGreaterThan(0.95);
  });

  it('reduced motion jumps to the target and holds a static glow while done', () => {
    const l = createLevels(1);
    l.display[0] = 'working';
    stepLevels(l, 1 / 60, true);
    expect(l.work[0]).toBe(1);
    expect(l.light[0]).toBeCloseTo(1);
    l.display[0] = 'done';
    run(l, 6, true);
    expect(l.work[0]).toBe(0);
    expect(l.celebrate[0]).toBe(STATIC_GLOW);
    l.display[0] = 'idle';
    stepLevels(l, 1 / 60, true);
    expect(l.celebrate[0]).toBe(0);
    expect(l.light[0]).toBeCloseTo(IDLE_LIGHT);
  });

  it('survives a long frame gap (hidden tab) without overshooting', () => {
    const l = createLevels(1);
    l.display[0] = 'working';
    stepLevels(l, 3600, false);
    expect(l.work[0]).toBe(1);
    expect(Number.isFinite(l.light[0])).toBe(true);
  });
});
