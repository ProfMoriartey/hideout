// React hooks over the singleton feed store (store.ts). Scene code uses
// useMember/useFeedStatus (they re-render only when their value changes);
// useFeed and useNow tick every second, so keep them in leaf DOM text, never
// in the Canvas tree.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { derive, type Derived, type MemberCore } from './derive';
import type { SourceKind, SourceStatus } from './source';
import { getFeedStore, type FeedStore } from './store';
import type { MemberId, StatusFeed } from './types';

export type FeedState = {
  feed: StatusFeed | null;
  derived: Derived;
  lastUpdated: number | null;
  status: SourceStatus;
  source: SourceKind;
};

/** One member's display state. Stable between changes, no clock-driven text. */
export function useMember(id: MemberId, store: FeedStore = getFeedStore()): MemberCore {
  return useSyncExternalStore(store.subscribe, () => store.getMember(id));
}

/** Connection state and the time the feed was last confirmed. */
export function useFeedStatus(store: FeedStore = getFeedStore()) {
  return useSyncExternalStore(store.subscribe, store.getStatus);
}

/** The current time, refreshed every `ms`. Leaf DOM text only. */
export function useNow(ms = 1000, store: FeedStore = getFeedStore()): number {
  const { clock } = store;
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    let timer: unknown = null;
    const loop = () => {
      setNow(clock.now());
      timer = clock.setTimeout(loop, ms);
    };
    timer = clock.setTimeout(loop, ms);
    return () => clock.clearTimeout(timer);
  }, [clock, ms]);
  return now;
}

/** Everything, re-derived every second (running times, ticker, missions). DOM only. */
export function useFeed(store: FeedStore = getFeedStore()): FeedState {
  const { snap, celebrations, nameOf } = useSyncExternalStore(store.subscribe, store.getState);
  const now = useNow(1000, store);
  const derived = useMemo(
    () => derive(snap.feed, celebrations, now, nameOf),
    [snap.feed, celebrations, now, nameOf],
  );
  return {
    feed: snap.feed,
    derived,
    lastUpdated: snap.lastUpdated,
    status: snap.status,
    source: snap.source,
  };
}
