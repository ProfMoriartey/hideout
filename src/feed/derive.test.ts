import { describe, expect, it } from 'vitest';
import {
  CELEBRATE_MS,
  STALE_AFTER_MS,
  derive,
  displayState,
  eventText,
  formatDuration,
  trackCelebrations,
} from './derive';
import type { MemberStatus, StatusFeed } from './types';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const H = 3_600_000;

function feed(partial: Partial<StatusFeed> = {}): StatusFeed {
  return { version: 1, updatedAt: iso(0), missions: [], members: {}, events: [], ...partial };
}

describe('displayState', () => {
  it('missing member is idle', () => {
    expect(displayState(undefined, NOW)).toBe('idle');
  });

  it('idle stays idle and recent working is working', () => {
    expect(displayState({ state: 'idle', since: iso(10 * H) }, NOW)).toBe('idle');
    expect(displayState({ state: 'working', since: iso(60_000) }, NOW)).toBe('working');
  });

  it('working turns stale strictly after 3 h', () => {
    expect(STALE_AFTER_MS).toBe(3 * H);
    expect(displayState({ state: 'working', since: iso(3 * H) }, NOW)).toBe('working');
    expect(displayState({ state: 'working', since: iso(3 * H + 1) }, NOW)).toBe('stale');
  });

  it('stale uses updatedAt when present, falling back to since', () => {
    const fresh: MemberStatus = {
      state: 'working',
      since: iso(4 * H),
      updatedAt: iso(10 * 60_000),
    };
    expect(displayState(fresh, NOW)).toBe('working');
    expect(displayState({ ...fresh, updatedAt: iso(3 * H + 1) }, NOW)).toBe('stale');
    expect(displayState({ ...fresh, updatedAt: iso(3 * H) }, NOW)).toBe('working');
  });

  it('running time still counts from since when updatedAt is newer', () => {
    const d = derive(
      feed({
        members: { feitan: { state: 'working', since: iso(4 * H), updatedAt: iso(60_000) } },
      }),
      {},
      NOW,
    );
    expect(d.members.feitan).toMatchObject({ display: 'working', runningFor: '4 h 0 min' });
  });

  it('done celebrates while since is under 8 s old, then idles', () => {
    const done = (ago: number): MemberStatus => ({ state: 'done', since: iso(ago) });
    expect(displayState(done(0), NOW)).toBe('done');
    expect(displayState(done(7_999), NOW)).toBe('done');
    expect(displayState(done(8_000), NOW)).toBe('idle');
    expect(displayState(done(H), NOW)).toBe('idle');
  });

  it('an old done celebrates while a live celebration window is open', () => {
    const old: MemberStatus = { state: 'done', since: iso(H) };
    expect(displayState(old, NOW, NOW + 1)).toBe('done');
    expect(displayState(old, NOW, NOW)).toBe('idle');
  });
});

describe('trackCelebrations', () => {
  it('opens a ~3 s window when a working -> done change is seen live', () => {
    expect(CELEBRATE_MS).toBe(3000);
    const before = feed({ members: { feitan: { state: 'working', since: iso(H) } } });
    const after = feed({ members: { feitan: { state: 'done', since: iso(H / 2) } } });
    const c = trackCelebrations(before, after, NOW, {});
    expect(c).toEqual({ feitan: NOW + 3000 });
    const d = derive(after, c, NOW + 2999);
    expect(d.members.feitan.display).toBe('done');
    expect(derive(after, c, NOW + 3000).members.feitan.display).toBe('idle');
  });

  it('does not celebrate on first load or for done -> done', () => {
    const done = feed({ members: { feitan: { state: 'done', since: iso(H) } } });
    expect(trackCelebrations(null, done, NOW, {})).toEqual({});
    expect(trackCelebrations(done, done, NOW, {})).toEqual({});
  });

  it('drops expired windows', () => {
    const f = feed();
    expect(trackCelebrations(f, f, NOW, { machi: NOW - 1, feitan: NOW + 5 })).toEqual({
      feitan: NOW + 5,
    });
  });
});

describe('derive', () => {
  it('fills every member, with running time for working members', () => {
    const d = derive(
      feed({
        members: {
          feitan: {
            state: 'working',
            since: iso(42 * 60_000),
            verb: 'interrogating',
            mission: 'Silk Lantern',
            progress: { done: 3, total: 7 },
          },
        },
      }),
      {},
      NOW,
    );
    expect(Object.keys(d.members)).toHaveLength(13);
    expect(d.members.machi.display).toBe('idle');
    expect(d.members.feitan).toMatchObject({
      id: 'feitan',
      name: 'Feitan',
      display: 'working',
      verb: 'interrogating',
      mission: 'Silk Lantern',
      progress: { done: 3, total: 7 },
      runningForMs: 42 * 60_000,
      runningFor: '42 min',
    });
    expect(d.members.machi.runningForMs).toBeNull();
    expect(d.workingCount).toBe(1);
  });

  it('builds the mission banner from the first active mission', () => {
    const d = derive(
      feed({
        missions: [
          { codename: 'Night Market', state: 'done', startedAt: iso(9 * H), endedAt: iso(8 * H) },
          {
            codename: 'Silk Lantern',
            state: 'active',
            startedAt: iso(2 * H),
            tickets: { done: 3, total: 10 },
          },
        ],
      }),
      {},
      NOW,
    );
    expect(d.banner).toMatchObject({
      codename: 'Silk Lantern',
      label: 'Operation Silk Lantern - 3/10',
      tickets: { done: 3, total: 10 },
      runningFor: '2 h 0 min',
    });
    expect(d.missions.map((m) => m.codename)).toEqual(['Silk Lantern', 'Night Market']);
    expect(derive(feed(), {}, NOW).banner).toBeNull();
  });

  it('keeps the last 10 events as ticker lines, newest first', () => {
    const events = Array.from({ length: 14 }, (_, i) => ({
      at: iso(i * 60_000),
      who: 'feitan' as const,
      kind: 'done' as const,
      verb: 'interrogating',
    }));
    const d = derive(feed({ events }), {}, NOW);
    expect(d.ticker).toHaveLength(10);
    expect(d.ticker[0]).toMatchObject({ text: 'Feitan finished interrogating', ago: 'just now' });
    expect(d.ticker[9]?.ago).toBe('9 min ago');
  });

  it('works without a feed', () => {
    const d = derive(null, {}, NOW);
    expect(d.members.chrollo.display).toBe('idle');
    expect(d.ticker).toEqual([]);
    expect(d.banner).toBeNull();
  });
});

describe('eventText', () => {
  it('builds text from kind, verb and display name only', () => {
    expect(eventText({ at: iso(0), who: 'feitan', kind: 'start', verb: 'interrogating' })).toBe(
      'Feitan started interrogating',
    );
    expect(eventText({ at: iso(0), who: 'feitan', kind: 'done', verb: 'interrogating' })).toBe(
      'Feitan finished interrogating',
    );
    expect(eventText({ at: iso(0), who: 'machi', kind: 'progress', verb: 'stitching' })).toBe(
      'Machi is still stitching',
    );
    expect(eventText({ at: iso(0), who: 'machi', kind: 'done' })).toBe('Machi finished');
    expect(eventText({ at: iso(0), who: 'machi', kind: 'start' })).toBe('Machi started work');
    expect(
      eventText({ at: iso(0), who: 'shalnark', kind: 'mission-start', mission: 'Silk Lantern' }),
    ).toBe('Operation Silk Lantern started');
    expect(
      eventText({ at: iso(0), who: 'shalnark', kind: 'mission-progress', mission: 'Silk Lantern' }),
    ).toBe('Operation Silk Lantern moved forward');
    expect(
      eventText({ at: iso(0), who: 'shalnark', kind: 'mission-done', mission: 'Silk Lantern' }),
    ).toBe('Operation Silk Lantern complete');
    expect(eventText({ at: iso(0), who: 'shalnark', kind: 'mission-done' })).toBe(
      'Operation complete',
    );
  });

  it('uses the injected display name', () => {
    expect(eventText({ at: iso(0), who: 'elders', kind: 'start' }, () => 'The Elders')).toBe(
      'The Elders started work',
    );
  });
});

describe('formatDuration', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatDuration(12_400)).toBe('12 s');
    expect(formatDuration(42 * 60_000 + 59_000)).toBe('42 min');
    expect(formatDuration(3 * H + 5 * 60_000)).toBe('3 h 5 min');
    expect(formatDuration(-5)).toBe('0 s');
  });
});
