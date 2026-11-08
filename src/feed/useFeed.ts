// React entry point for the feed: picks the live or demo source, keeps the
// last snapshot, tracks live celebrations and re-derives once a second.
import { useEffect, useMemo, useState } from 'react';
import { createDemoSource } from './demo';
import { derive, trackCelebrations, type Celebrations, type Derived } from './derive';
import {
  FEED_CONFIG,
  createFeedSource,
  systemClock,
  type Clock,
  type FeedConfig,
  type FeedSnapshot,
  type FetchLike,
  type SourceKind,
  type SourceStatus,
  type Visibility,
} from './source';
import type { StatusFeed } from './types';

export type FeedState = {
  feed: StatusFeed | null;
  derived: Derived;
  lastUpdated: number | null;
  status: SourceStatus;
  source: SourceKind;
};

export type UseFeedOptions = {
  /** Defaults to `?demo=1` in the page URL. */
  demo?: boolean;
  /** Demo seed; defaults to `?seed=<n>` or 1. */
  seed?: number;
  config?: FeedConfig;
  fetch?: FetchLike;
  clock?: Clock;
  visibility?: Visibility;
};

export const DEFAULT_SEED = 1;
const TICK_MS = 1000;

/** Reads `?demo=1` and `?seed=<n>` from a query string. */
export function readDemoParams(search: string): { demo: boolean; seed: number } {
  const params = new URLSearchParams(search);
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  return {
    demo: params.get('demo') === '1',
    seed: Number.isFinite(seed) ? seed : DEFAULT_SEED,
  };
}

type Held = { snap: FeedSnapshot; celebrations: Celebrations };

export function useFeed(options: UseFeedOptions = {}): FeedState {
  const fromUrl = readDemoParams(typeof location === 'undefined' ? '' : location.search);
  const demo = options.demo ?? fromUrl.demo;
  const seed = options.seed ?? fromUrl.seed;
  const { config = FEED_CONFIG, fetch, clock = systemClock, visibility } = options;

  const [held, setHeld] = useState<Held>(() => ({
    snap: { feed: null, lastUpdated: null, status: 'loading', source: demo ? 'demo' : 'api' },
    celebrations: {},
  }));
  const [now, setNow] = useState(() => clock.now());

  useEffect(() => {
    const onChange = (snap: FeedSnapshot) => {
      const t = clock.now();
      setNow(t);
      setHeld((prev) => ({
        snap,
        celebrations:
          snap.feed && snap.feed !== prev.snap.feed
            ? trackCelebrations(prev.snap.feed, snap.feed, t, prev.celebrations)
            : prev.celebrations,
      }));
    };
    const source = demo
      ? createDemoSource({ seed, clock, onChange })
      : createFeedSource({
          config,
          clock,
          onChange,
          ...(fetch ? { fetch } : {}),
          ...(visibility ? { visibility } : {}),
        });
    source.start();
    return () => source.stop();
  }, [demo, seed, config, fetch, clock, visibility]);

  useEffect(() => {
    let timer: unknown = null;
    const loop = () => {
      setNow(clock.now());
      timer = clock.setTimeout(loop, TICK_MS);
    };
    timer = clock.setTimeout(loop, TICK_MS);
    return () => clock.clearTimeout(timer);
  }, [clock]);

  const { snap, celebrations } = held;
  const derived = useMemo(
    () => derive(snap.feed, celebrations, now),
    [snap.feed, celebrations, now],
  );
  return {
    feed: snap.feed,
    derived,
    lastUpdated: snap.lastUpdated,
    status: snap.status,
    source: snap.source,
  };
}
