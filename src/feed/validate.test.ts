import { describe, expect, it } from 'vitest';
import { validateFeed } from './validate';

const T = '2026-11-08T12:00:00Z';

function goodFeed(): Record<string, unknown> {
  return {
    version: 1,
    updatedAt: T,
    missions: [
      { codename: 'Silk Lantern', state: 'active', startedAt: T, tickets: { done: 3, total: 10 } },
    ],
    members: {
      feitan: {
        state: 'working',
        since: T,
        verb: 'interrogating',
        mission: 'Silk Lantern',
        progress: { done: 2, total: 5 },
      },
      machi: { state: 'idle', since: '2026-11-08T11:00:00.123Z', updatedAt: T },
    },
    events: [
      { at: T, who: 'feitan', kind: 'start', verb: 'interrogating', mission: 'Silk Lantern' },
      { at: T, who: 'shalnark', kind: 'mission-start', mission: 'Silk Lantern' },
    ],
  };
}

function first(list: unknown): Record<string, unknown> {
  const v = (list as Record<string, unknown>[])[0];
  if (!v) throw new Error('fixture has no first item');
  return v;
}

function member(f: Record<string, unknown>, id: string): Record<string, unknown> {
  const v = (f.members as Record<string, Record<string, unknown>>)[id];
  if (!v) throw new Error(`fixture has no member ${id}`);
  return v;
}

function rejects(mutate: (f: Record<string, unknown>) => void) {
  const f = structuredClone(goodFeed());
  mutate(f);
  return validateFeed(f).ok === false;
}

describe('validateFeed', () => {
  it('accepts a valid document and returns it typed', () => {
    const r = validateFeed(goodFeed());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.feed.members.feitan?.verb).toBe('interrogating');
      expect(r.feed.events).toHaveLength(2);
    }
  });

  it('accepts an empty feed', () => {
    expect(
      validateFeed({ version: 1, updatedAt: T, missions: [], members: {}, events: [] }).ok,
    ).toBe(true);
  });

  it('rejects non-objects and wrong versions', () => {
    expect(validateFeed(null).ok).toBe(false);
    expect(validateFeed('{}').ok).toBe(false);
    expect(validateFeed([]).ok).toBe(false);
    expect(rejects((f) => (f.version = 2))).toBe(true);
    expect(rejects((f) => delete f.events)).toBe(true);
  });

  it('rejects free text anywhere', () => {
    expect(rejects((f) => (f.note = 'hello'))).toBe(true);
    expect(
      rejects((f) => {
        first(f.events).text = 'finished interrogating';
      }),
    ).toBe(true);
    expect(
      rejects((f) => {
        member(f, 'feitan').verb = 'reading my email';
      }),
    ).toBe(true);
    expect(
      rejects((f) => {
        first(f.missions).description = 'secret';
      }),
    ).toBe(true);
    expect(
      rejects((f) => {
        member(f, 'feitan').progress = {
          done: 1,
          total: 2,
          note: 'x',
        };
      }),
    ).toBe(true);
  });

  it('rejects verbs that match the pattern but are not allowlisted', () => {
    expect(
      rejects((f) => {
        member(f, 'feitan').verb = 'sleeping';
      }),
    ).toBe(true);
    expect(
      rejects((f) => {
        first(f.events).verb = 'sleeping';
      }),
    ).toBe(true);
  });

  it('rejects bad mission codenames', () => {
    for (const bad of [
      'silk lantern',
      'Silk lantern',
      'A B C D',
      'Silk  Lantern',
      'Silk-Lantern',
      'X',
    ]) {
      expect(
        rejects((f) => {
          first(f.missions).codename = bad;
        }),
        bad,
      ).toBe(true);
    }
    expect(
      rejects((f) => {
        member(f, 'feitan').mission = 'silk';
      }),
    ).toBe(true);
    expect(
      rejects((f) => {
        first(f.missions).state = 'paused';
      }),
    ).toBe(true);
  });

  it('rejects bad counts and timestamps', () => {
    const setProgress = (p: unknown) => (f: Record<string, unknown>) => {
      member(f, 'feitan').progress = p;
    };
    expect(rejects(setProgress({ done: 1, total: 0 }))).toBe(true);
    expect(rejects(setProgress({ done: -1, total: 5 }))).toBe(true);
    expect(rejects(setProgress({ done: 1.5, total: 5 }))).toBe(true);
    expect(rejects(setProgress({ done: 1, total: 1000 }))).toBe(true);
    expect(rejects(setProgress({ done: '1', total: 5 }))).toBe(true);
    expect(rejects((f) => (f.updatedAt = '2026-11-08 12:00'))).toBe(true);
    expect(rejects((f) => (member(f, 'machi').updatedAt = 'yesterday'))).toBe(true);
    expect(rejects((f) => (f.updatedAt = '2026-13-45T99:99:99Z'))).toBe(true);
  });

  it('rejects oversized documents', () => {
    const ev = { at: T, who: 'feitan', kind: 'done', verb: 'interrogating' };
    expect(rejects((f) => (f.events = Array.from({ length: 21 }, () => ev)))).toBe(true);
    expect(validateFeed({ ...goodFeed(), events: Array.from({ length: 20 }, () => ev) }).ok).toBe(
      true,
    );
    const m = { codename: 'Silk Lantern', state: 'done', startedAt: T };
    expect(rejects((f) => (f.missions = Array.from({ length: 11 }, () => m)))).toBe(true);
  });

  it('rejects unknown event kinds and member states', () => {
    expect(
      rejects((f) => {
        first(f.events).kind = 'chat';
      }),
    ).toBe(true);
    expect(
      rejects((f) => {
        member(f, 'machi').state = 'sleeping';
      }),
    ).toBe(true);
  });

  it('ignores unknown member ids instead of rejecting the document', () => {
    const f = goodFeed();
    (f.members as Record<string, unknown>).hisoka = { state: 'working', since: T, verb: 'x' };
    (f.events as unknown[]).push({ at: T, who: 'hisoka', kind: 'start' });
    const r = validateFeed(f);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.feed.members).sort()).toEqual(['feitan', 'machi']);
      expect(r.feed.events.map((e) => e.who)).toEqual(['feitan', 'shalnark']);
    }
  });

  it('does not let prototype keys through as members', () => {
    const f = goodFeed();
    const key: string = 'toString';
    (f.members as Record<string, unknown>)[key] = { state: 'idle', since: T };
    const r = validateFeed(f);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.feed.members)).not.toContain('toString');
  });

  it('returns a copy holding only known fields', () => {
    const f = goodFeed();
    const r = validateFeed(f);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.feed).not.toBe(f);
  });
});
