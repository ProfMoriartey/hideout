// One feed per page: a module singleton that starts its source on the first
// subscriber and stops it on the last, so N components cost one poller. Hooks
// live in useFeed.ts; this file has no React in it.
import { createDemoSource } from './demo';
import {
  STALE_AFTER_MS,
  RECENT_DONE_MS,
  defaultName,
  memberCore,
  trackCelebrations,
  type Celebrations,
  type MemberCore,
  type NameOf,
} from './derive';
import {
  FEED_CONFIG,
  createFeedSource,
  systemClock,
  type Clock,
  type FeedConfig,
  type FeedSnapshot,
  type FeedSource,
  type FetchLike,
  type Visibility,
} from './source';
import type { MemberId } from './types';
import { MEMBER_IDS } from './validate';

export const DEFAULT_SEED = 1;

export type FeedStatus = Pick<FeedSnapshot, 'status' | 'source' | 'lastUpdated'>;
export type StoreState = { snap: FeedSnapshot; celebrations: Celebrations; nameOf: NameOf };

export type StoreOptions = {
  demo?: boolean;
  seed?: number;
  /** Demo only: start of demo step 0 (epoch ms). */
  origin?: number;
  config?: FeedConfig;
  fetch?: FetchLike;
  clock?: Clock;
  visibility?: Visibility;
  /** The seam for src/config/members.ts: the lead wires it with setNameOf at integration. */
  nameOf?: NameOf;
};

export type FeedStore = {
  clock: Clock;
  subscribe(cb: () => void): () => void;
  /** Stable between changes (for useSyncExternalStore). */
  getState(): StoreState;
  getStatus(): FeedStatus;
  /** Stable between display changes; no clock-driven text. */
  getMember(id: MemberId): MemberCore;
  setNameOf(nameOf: NameOf): void;
};

/** Reads `?demo=1`, `?seed=<n>` and `?origin=<epoch ms>` from a query string. */
export function readDemoParams(search: string): {
  demo: boolean;
  seed: number;
  origin?: number;
} {
  const params = new URLSearchParams(search);
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  const origin = Number.parseInt(params.get('origin') ?? '', 10);
  return {
    demo: params.get('demo') === '1',
    seed: Number.isFinite(seed) ? seed : DEFAULT_SEED,
    ...(Number.isFinite(origin) ? { origin } : {}),
  };
}

// shortcut: views are tiny, so JSON equality is cheap; use a real comparer if they grow.
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function createFeedStore(o: StoreOptions = {}): FeedStore {
  const clock = o.clock ?? systemClock;
  const demo = o.demo ?? false;
  const listeners = new Set<() => void>();
  const members = {} as Record<MemberId, MemberCore>;
  let state: StoreState = {
    snap: { feed: null, lastUpdated: null, status: 'loading', source: demo ? 'demo' : 'api' },
    celebrations: {},
    nameOf: o.nameOf ?? defaultName,
  };
  let status: FeedStatus = pickStatus(state.snap);
  let source: FeedSource | null = null;
  let boundary: unknown = null;

  function pickStatus({ status, source, lastUpdated }: FeedSnapshot): FeedStatus {
    return { status, source, lastUpdated };
  }

  /** Next moment a member's display changes by the clock alone (stale, end of done). */
  function nextBoundary(now: number): number | null {
    const times: number[] = [];
    for (const id of MEMBER_IDS) {
      const m = state.snap.feed?.members[id];
      const until = state.celebrations[id];
      if (until !== undefined) times.push(until);
      if (m?.state === 'working') {
        times.push(Date.parse(m.updatedAt ?? m.since) + STALE_AFTER_MS + 1);
      } else if (m?.state === 'done') {
        times.push(Date.parse(m.since) + RECENT_DONE_MS);
      }
    }
    const future = times.filter((t) => t > now);
    return future.length ? Math.min(...future) : null;
  }

  function recompute() {
    if (boundary !== null) clock.clearTimeout(boundary);
    boundary = null;
    const now = clock.now();
    for (const id of MEMBER_IDS) {
      const next = memberCore(
        id,
        state.snap.feed?.members[id],
        now,
        state.celebrations[id],
        state.nameOf,
      );
      if (!same(members[id], next)) members[id] = next;
    }
    const at = nextBoundary(now);
    if (at !== null && listeners.size) {
      boundary = clock.setTimeout(() => {
        boundary = null;
        recompute();
        listeners.forEach((cb) => cb());
      }, at - now);
    }
  }

  function onChange(snap: FeedSnapshot) {
    const celebrations =
      snap.feed && snap.feed !== state.snap.feed
        ? trackCelebrations(state.snap.feed, snap.feed, clock.now(), state.celebrations)
        : state.celebrations;
    state = { ...state, snap, celebrations };
    const next = pickStatus(snap);
    if (!same(status, next)) status = next;
    recompute();
    listeners.forEach((cb) => cb());
  }

  function start() {
    const common = { clock, onChange };
    source = demo
      ? createDemoSource({
          ...common,
          seed: o.seed ?? DEFAULT_SEED,
          ...(o.origin !== undefined ? { origin: o.origin } : {}),
        })
      : createFeedSource({
          ...common,
          config: o.config ?? FEED_CONFIG,
          ...(o.fetch ? { fetch: o.fetch } : {}),
          ...(o.visibility ? { visibility: o.visibility } : {}),
        });
    source.start();
  }

  function stop() {
    source?.stop();
    source = null;
    if (boundary !== null) clock.clearTimeout(boundary);
    boundary = null;
  }

  recompute();

  return {
    clock,
    subscribe(cb) {
      listeners.add(cb);
      if (!source) {
        start();
        recompute();
      }
      return () => {
        listeners.delete(cb);
        // Deferred, so a StrictMode unmount/remount does not restart the poller.
        void Promise.resolve().then(() => {
          if (listeners.size === 0) stop();
        });
      };
    },
    getState: () => state,
    getStatus: () => status,
    getMember: (id) => members[id],
    setNameOf(nameOf) {
      state = { ...state, nameOf };
      recompute();
      listeners.forEach((cb) => cb());
    },
  };
}

let shared: FeedStore | undefined;
/** The page-wide store; `?demo=1`, `?seed=` and `?origin=` come from the URL. */
export function getFeedStore(): FeedStore {
  shared ??= createFeedStore(
    readDemoParams(typeof location === 'undefined' ? '' : location.search),
  );
  return shared;
}
