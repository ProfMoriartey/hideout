import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Clock, FetchLike, Visibility } from './source';
import { readDemoParams, useFeed, type FeedState, type UseFeedOptions } from './useFeed';

const START = Date.parse('2026-11-08T12:00:00Z');

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function fakeClock() {
  const timers = new Map<number, { at: number; fn: () => void }>();
  let id = 0;
  const c = {
    t: START,
    now: () => c.t,
    setTimeout: (fn: () => void, ms: number) => {
      timers.set(++id, { at: c.t + ms, fn });
      return id;
    },
    clearTimeout: (h: unknown) => void timers.delete(h as number),
    advance(ms: number) {
      const end = c.t + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, v]) => v.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        c.t = due[1].at;
        due[1].fn();
      }
      c.t = end;
    },
  };
  return c satisfies Clock;
}

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

function render(options: UseFeedOptions) {
  const out: { current: FeedState | null } = { current: null };
  function Probe() {
    out.current = useFeed(options);
    return null;
  }
  const r = createRoot(document.createElement('div'));
  root = r;
  act(() => r.render(<Probe />));
  return out;
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await act(async () => {});
};

describe('useFeed', () => {
  it('serves the demo feed with derived state', () => {
    const clock = fakeClock();
    const r = render({ demo: true, seed: 4, clock });
    expect(r.current).toMatchObject({ status: 'live', source: 'demo', lastUpdated: START });
    expect(r.current?.derived.workingCount).toBeGreaterThanOrEqual(3);
    expect(r.current?.derived.ticker.length).toBeGreaterThan(0);
    act(() => clock.advance(4000));
    expect(r.current?.lastUpdated).toBe(START + 4000);
  });

  it('goes from loading to live with the API source', async () => {
    const clock = fakeClock();
    const sha = 'c'.repeat(40);
    const body = {
      version: 1,
      updatedAt: '2026-11-08T11:59:00Z',
      missions: [],
      members: {
        feitan: { state: 'working', since: '2026-11-08T11:18:00Z', verb: 'interrogating' },
      },
      events: [],
    };
    const fetch: FetchLike = async (url) => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      text: async () => (url.includes('/commits/') ? sha : JSON.stringify(body)),
    });
    const visibility: Visibility = { hidden: () => false, subscribe: () => () => {} };
    const r = render({ demo: false, clock, fetch, visibility });
    expect(r.current).toMatchObject({ status: 'loading', source: 'api', feed: null });
    await flush();
    expect(r.current).toMatchObject({ status: 'live', source: 'api', lastUpdated: START });
    expect(r.current?.derived.members.feitan).toMatchObject({
      display: 'working',
      runningFor: '42 min',
    });
  });
});

describe('readDemoParams', () => {
  it('reads demo and seed', () => {
    expect(readDemoParams('?demo=1&seed=7')).toEqual({ demo: true, seed: 7 });
    expect(readDemoParams('')).toEqual({ demo: false, seed: 1 });
    expect(readDemoParams('?demo=yes&seed=x')).toEqual({ demo: false, seed: 1 });
  });
});
