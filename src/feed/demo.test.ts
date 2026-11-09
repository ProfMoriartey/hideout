import { describe, expect, it } from 'vitest';
import { DEMO_CYCLE, DEMO_STEP_MS, createDemoSource, demoFeedAt, demoStep } from './demo';
import { displayState } from './derive';
import type { FeedSnapshot, Clock } from './source';
import { MEMBER_IDS, validateFeed } from './validate';

const ORIGIN = Date.parse('2026-11-08T12:00:00Z');
const at = (step: number) => ORIGIN + step * DEMO_STEP_MS;

describe('demo feed', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    expect(demoFeedAt(7, 42, ORIGIN)).toEqual(demoFeedAt(7, 42, ORIGIN));
    const steps = Array.from({ length: DEMO_CYCLE }, (_, i) => i);
    const a = steps.map((s) => demoFeedAt(s, 1, ORIGIN));
    const b = steps.map((s) => demoFeedAt(s, 2, ORIGIN));
    expect(a).not.toEqual(b);
  });

  it('always produces documents that pass the validator', () => {
    for (let step = 0; step < 60; step++) {
      const r = validateFeed(demoFeedAt(step, 3, ORIGIN));
      expect(r.ok, `step ${step}`).toBe(true);
    }
  });

  it('cycles every member through all four display states', () => {
    for (const id of MEMBER_IDS) {
      const seen = new Set<string>();
      for (let step = 0; step < DEMO_CYCLE; step++) {
        seen.add(displayState(demoFeedAt(step, 1, ORIGIN).members[id], at(step)));
      }
      expect([...seen].sort(), id).toEqual(['done', 'idle', 'stale', 'working']);
    }
  });

  it('keeps several members working at once', () => {
    for (let step = 0; step < 40; step++) {
      const f = demoFeedAt(step, 9, ORIGIN);
      const working = MEMBER_IDS.filter(
        (id) => displayState(f.members[id], at(step)) === 'working',
      );
      expect(working.length, `step ${step}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('has missions with ticket counts and events, newest first', () => {
    const f = demoFeedAt(25, 1, ORIGIN);
    expect(f.missions.length).toBeGreaterThanOrEqual(1);
    expect(f.missions.every((m) => m.tickets !== undefined)).toBe(true);
    expect(f.events.length).toBeGreaterThan(0);
    expect(f.events.length).toBeLessThanOrEqual(20);
    const times = f.events.map((e) => Date.parse(e.at));
    expect([...times].sort((x, y) => y - x)).toEqual(times);
    expect(new Set(f.events.map((e) => e.kind)).size).toBeGreaterThanOrEqual(3);
  });

  it('writes mission events as chrollo, like the real feed', () => {
    const missionEvents = Array.from({ length: 40 }, (_, k) => demoFeedAt(k, 1, ORIGIN))
      .flatMap((f) => f.events)
      .filter((e) => e.kind.startsWith('mission-'));
    expect(missionEvents.length).toBeGreaterThan(0);
    expect(missionEvents.every((e) => e.who === 'chrollo')).toBe(true);
  });

  it('maps time to steps', () => {
    expect(demoStep(ORIGIN, ORIGIN)).toBe(0);
    expect(demoStep(ORIGIN + DEMO_STEP_MS - 1, ORIGIN)).toBe(0);
    expect(demoStep(ORIGIN + DEMO_STEP_MS, ORIGIN)).toBe(1);
  });

  it('demo source emits a live demo snapshot every step', () => {
    let t = ORIGIN;
    const timers: (() => void)[] = [];
    const clock: Clock = {
      now: () => t,
      setTimeout: (fn) => timers.push(fn),
      clearTimeout: () => {},
    };
    const snaps: FeedSnapshot[] = [];
    const src = createDemoSource({ seed: 5, clock, onChange: (s) => snaps.push(s) });
    src.start();
    expect(snaps[0]).toMatchObject({ status: 'live', source: 'demo', lastUpdated: ORIGIN });
    expect(snaps[0]?.feed).toEqual(demoFeedAt(0, 5, ORIGIN));
    t += DEMO_STEP_MS;
    timers.shift()?.();
    expect(snaps[1]?.feed).toEqual(demoFeedAt(1, 5, ORIGIN));
    src.stop();
  });
});
