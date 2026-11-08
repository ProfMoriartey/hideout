import { describe, expect, it } from 'vitest';
import { createMonitor, startTier, stepMonitor, type Monitor } from './quality';

/** Feeds `seconds` of frames at `fps`; returns how many times the tier dropped. */
function run(m: Monitor, fps: number, seconds: number): number {
  let drops = 0;
  for (let i = 0; i < Math.round(fps * seconds); i++) if (stepMonitor(m, 1 / fps)) drops++;
  return drops;
}

describe('quality tiers', () => {
  it('starts medium on touch devices and high elsewhere', () => {
    expect(startTier(true)).toBe('medium');
    expect(startTier(false)).toBe('high');
  });

  it('keeps the tier while the average holds at or above 45 fps', () => {
    const m = createMonitor('high');
    expect(run(m, 50, 30)).toBe(0);
    expect(m.tier).toBe('high');
  });

  it('drops one tier per 3 s window under 45 fps, down to low and no further', () => {
    const m = createMonitor('high');
    expect(run(m, 30, 2.9)).toBe(0);
    expect(run(m, 30, 0.2)).toBe(1);
    expect(m.tier).toBe('medium');
    run(m, 30, 3.1);
    expect(m.tier).toBe('low');
    expect(run(m, 10, 30)).toBe(0);
  });

  it('never climbs back up, however fast the frames get', () => {
    const m = createMonitor('medium');
    run(m, 20, 3.1);
    run(m, 120, 60);
    expect(m.tier).toBe('low');
  });

  it('a long gap (hidden tab) restarts the window instead of counting as slow', () => {
    const m = createMonitor('high');
    run(m, 60, 2);
    expect(stepMonitor(m, 30)).toBe(false);
    expect(run(m, 60, 10)).toBe(0);
    expect(m.tier).toBe('high');
  });
});
