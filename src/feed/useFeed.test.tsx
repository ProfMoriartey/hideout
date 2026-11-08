import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { StatusFeed } from './types';
import type { Clock, FetchLike, Visibility } from './source';
import { StrictMode } from 'react';
import { createFeedStore, readDemoParams, type StoreOptions } from './store';
import { useFeed, useMember } from './useFeed';

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

function mount(node: React.ReactNode) {
  const r = createRoot(document.createElement('div'));
  root = r;
  act(() => r.render(node));
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await act(async () => {});
};

const visibility: Visibility = { hidden: () => false, subscribe: () => () => {} };
const SHA = 'c'.repeat(40);
const body: StatusFeed = {
  version: 1,
  updatedAt: '2026-11-08T11:59:00Z',
  missions: [],
  members: { feitan: { state: 'working', since: '2026-11-08T11:18:00Z', verb: 'interrogating' } },
  events: [],
};

function liveStore(extra: Partial<StoreOptions> = {}) {
  const clock = fakeClock();
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    return {
      status: 200,
      ok: true,
      headers: { get: () => null },
      text: async () => (url.includes('/commits/') ? SHA : JSON.stringify(body)),
    };
  };
  const store = createFeedStore({ demo: false, clock, fetch, visibility, ...extra });
  return { clock, calls, store };
}

describe('useFeed', () => {
  it('serves the demo feed with derived state', () => {
    const clock = fakeClock();
    const store = createFeedStore({ demo: true, seed: 4, clock });
    const out: { current: ReturnType<typeof useFeed> | null } = { current: null };
    function Probe() {
      out.current = useFeed(store);
      return null;
    }
    mount(<Probe />);
    expect(out.current).toMatchObject({ status: 'live', source: 'demo', lastUpdated: START });
    expect(out.current?.derived.workingCount).toBeGreaterThanOrEqual(3);
    act(() => clock.advance(4000));
    expect(out.current?.lastUpdated).toBe(START + 4000);
  });

  it('goes from loading to live with the API source', async () => {
    const { store } = liveStore();
    const out: { current: ReturnType<typeof useFeed> | null } = { current: null };
    function Probe() {
      out.current = useFeed(store);
      return null;
    }
    mount(<Probe />);
    expect(out.current).toMatchObject({ status: 'loading', source: 'api', feed: null });
    await flush();
    expect(out.current).toMatchObject({ status: 'live', source: 'api', lastUpdated: START });
    expect(out.current?.derived.members.feitan).toMatchObject({
      display: 'working',
      runningFor: '42 min',
    });
  });

  it('runs one poller for N subscribers, through a StrictMode double mount', async () => {
    const { calls, store } = liveStore();
    function Many() {
      const a = useMember('feitan', store);
      const b = useMember('feitan', store);
      const c = useFeed(store);
      return <i>{a.display + b.display + c.status}</i>;
    }
    mount(
      <StrictMode>
        <Many />
        <Many />
      </StrictMode>,
    );
    await flush();
    expect(calls.filter((u) => u.includes('/commits/'))).toHaveLength(1);
  });

  it('stops the poller on the last unsubscribe', async () => {
    const { clock, calls, store } = liveStore();
    const off = store.subscribe(() => {});
    await flush();
    off();
    await flush();
    act(() => clock.advance(5 * 60_000));
    await flush();
    expect(calls.filter((u) => u.includes('/commits/'))).toHaveLength(1);
  });

  it('keeps member values stable across feed refetches and wakes at the stale boundary', async () => {
    const { clock, store } = liveStore();
    const seen: unknown[] = [];
    const off = store.subscribe(() => seen.push(store.getMember('feitan')));
    await flush();
    const first = store.getMember('feitan');
    expect(first.display).toBe('working');
    act(() => clock.advance(30_000)); // 304-less refetch of the same document
    await flush();
    expect(store.getMember('feitan')).toBe(first);
    // Last write 11:18; stale 3 h later, with no feed change in between.
    act(() => clock.advance(3 * 60 * 60_000));
    await flush();
    expect(store.getMember('feitan').display).toBe('stale');
    off();
  });

  it('takes names from the nameOf seam', async () => {
    const { store } = liveStore({ nameOf: (id) => `<${id}>` });
    const off = store.subscribe(() => {});
    expect(store.getMember('feitan').name).toBe('<feitan>');
    store.setNameOf((id) => id.toUpperCase());
    expect(store.getMember('feitan').name).toBe('FEITAN');
    off();
  });
});

describe('readDemoParams', () => {
  it('reads demo, seed and origin', () => {
    expect(readDemoParams('?demo=1&seed=7&origin=1000')).toEqual({
      demo: true,
      seed: 7,
      origin: 1000,
    });
    expect(readDemoParams('')).toEqual({ demo: false, seed: 1 });
    expect(readDemoParams('?demo=yes&seed=x&origin=y')).toEqual({ demo: false, seed: 1 });
  });
});
