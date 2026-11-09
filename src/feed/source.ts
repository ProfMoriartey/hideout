// Live feed reader. Method fixed in docs/ARCHITECTURE.md ("Feed: how the site reads it"):
// poll the branch head SHA with a conditional request, fetch raw status.json at that
// SHA when it changes, stretch the interval to the rate-limit budget, fall back to
// raw <branch> when the API is limited, back off while offline, pause while hidden.
import type { StatusFeed } from './types';
import { validateFeed } from './validate';

export type FeedConfig = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  apiBase: string;
  rawBase: string;
};

export const FEED_CONFIG: FeedConfig = {
  owner: 'ProfMoriartey',
  repo: 'hideout-status',
  branch: 'main',
  path: 'status.json',
  apiBase: 'https://api.github.com',
  rawBase: 'https://raw.githubusercontent.com',
};

export const BASE_INTERVAL_MS = 30_000;
export const MAX_BACKOFF_MS = 120_000;
/** Longest wait between API checks; a longer budget interval reads raw main in between. */
export const MAX_API_DELAY_MS = 120_000;
/** Reset times beyond this are a skewed client clock, not a real wait. */
const MAX_RESET_WAIT_MS = 3_600_000;
/** Requests kept in reserve when stretching the interval to the budget. */
const BUDGET_RESERVE = 2;
/** Fallback length when a 403/429 carries no usable reset time. */
const DEFAULT_FALLBACK_MS = 60_000;
/** Fastest immediate retry when the network returns, so flapping events cannot hammer it. */
const OFFLINE_RETRY_GAP_MS = 5000;
const SHA_RE = /^[0-9a-f]{40}$/;

export type ResponseLike = {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<ResponseLike>;

export type Clock = {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type Visibility = {
  hidden(): boolean;
  /** Calls `cb` on every visibility change or return of the network; returns an unsubscribe function. */
  subscribe(cb: () => void): () => void;
};

export type SourceStatus = 'loading' | 'live' | 'stale-source' | 'offline' | 'error';
export type SourceKind = 'api' | 'raw-fallback' | 'demo';

export type FeedSnapshot = {
  /** Last valid feed; kept through offline and error states. */
  feed: StatusFeed | null;
  /** When the feed was last confirmed current (epoch ms). */
  lastUpdated: number | null;
  status: SourceStatus;
  source: SourceKind;
  error?: string;
};

export type FeedSource = { start(): void; stop(): void };

export type SourceOptions = {
  config?: FeedConfig;
  fetch?: FetchLike;
  clock?: Clock;
  visibility?: Visibility;
  onChange(snapshot: FeedSnapshot): void;
};

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export const documentVisibility: Visibility = {
  hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  subscribe: (cb) => {
    if (typeof document === 'undefined') return () => {};
    document.addEventListener('visibilitychange', cb);
    window.addEventListener('online', cb);
    return () => {
      document.removeEventListener('visibilitychange', cb);
      window.removeEventListener('online', cb);
    };
  },
};

/** A hung request (tunnel, captive portal) would block every later poll. */
export const FETCH_TIMEOUT_MS = 15_000;

export const browserFetch: FetchLike = (url, init) =>
  globalThis.fetch(url, {
    ...init,
    // Older browsers without AbortSignal.timeout keep the old, untimed fetch.
    ...(typeof AbortSignal.timeout === 'function'
      ? { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
      : {}),
  });

/** Time until the rate-limit reset, clamped so a skewed client clock cannot stretch it. */
function untilReset(headers: ResponseLike['headers'], now: number): number {
  const wait = Number(headers.get('X-RateLimit-Reset')) * 1000 - now;
  return wait > 0 ? Math.min(wait, MAX_RESET_WAIT_MS) : 0;
}

/** Next API check delay: max(30 s, time to reset / max(remaining - 2, 1)). */
export function budgetInterval(headers: ResponseLike['headers'], now: number): number {
  const remaining = Number(headers.get('X-RateLimit-Remaining'));
  const wait = untilReset(headers, now);
  if (!headers.get('X-RateLimit-Remaining') || !Number.isFinite(remaining) || wait <= 0) {
    return BASE_INTERVAL_MS;
  }
  return Math.max(BASE_INTERVAL_MS, wait / Math.max(remaining - BUDGET_RESERVE, 1));
}

class Offline extends Error {}

/** `transient`: an HTTP failure, retried; otherwise the document itself is bad. */
type Doc = { feed: StatusFeed } | { error: string; transient: boolean };

export function createFeedSource(options: SourceOptions): FeedSource {
  const config = options.config ?? FEED_CONFIG;
  const fetchFn = options.fetch ?? browserFetch;
  const clock = options.clock ?? systemClock;
  const visibility = options.visibility ?? documentVisibility;
  const { owner, repo, branch, path } = config;
  const apiUrl = `${config.apiBase}/repos/${owner}/${repo}/commits/${branch}`;
  const rawUrl = (ref: string) => `${config.rawBase}/${owner}/${repo}/${ref}/${path}`;

  let snap: FeedSnapshot = { feed: null, lastUpdated: null, status: 'loading', source: 'api' };
  let etag: string | null = null;
  let lastSha: string | null = null;
  /** The document at lastSha failed validation. */
  let shaInvalid = false;
  /** No API call before this time; raw main is read until then. */
  let apiNotBefore = 0;
  /** When the next poll is due; a visibility flip must not poll earlier. */
  let nextAt = 0;
  let lastTickAt = -Infinity;
  let failures = 0;
  let timer: unknown = null;
  let inFlight = false;
  let running = false;
  let unsubscribe: () => void = () => {};

  function emit(patch: Partial<FeedSnapshot>) {
    if (!running) return;
    const next: FeedSnapshot = { ...snap, ...patch };
    if (!('error' in patch) && next.status !== 'error') delete next.error;
    snap = next;
    options.onChange(snap);
  }

  function schedule(ms: number) {
    nextAt = clock.now() + ms;
    if (timer !== null) clock.clearTimeout(timer);
    timer = clock.setTimeout(() => {
      timer = null;
      void tick();
    }, ms);
  }

  async function get(url: string, headers?: Record<string, string>): Promise<ResponseLike> {
    try {
      return await fetchFn(url, headers ? { headers } : undefined);
    } catch {
      throw new Offline();
    }
  }

  /** Fetches and validates one document. */
  async function fetchDoc(url: string): Promise<Doc> {
    const r = await get(url);
    if (!r.ok) return { error: `HTTP ${r.status} for ${path}`, transient: true };
    let body: string;
    try {
      body = await r.text();
    } catch {
      throw new Offline();
    }
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      return { error: 'feed is not JSON', transient: false };
    }
    const v = validateFeed(data);
    return v.ok ? { feed: v.feed } : { error: `invalid feed (${v.error})`, transient: false };
  }

  function startFallback(headers: ResponseLike['headers'], now: number) {
    const retry = Number(headers.get('Retry-After')) * 1000;
    const wait = retry > 0 ? retry : untilReset(headers, now) || DEFAULT_FALLBACK_MS;
    apiNotBefore = now + Math.min(wait, MAX_RESET_WAIT_MS);
  }

  async function pollFallback(): Promise<number> {
    const doc = await fetchDoc(rawUrl(branch));
    const now = clock.now();
    if (!('feed' in doc)) {
      emit({ status: 'error', source: 'raw-fallback', error: doc.error });
    } else if (snap.feed && Date.parse(doc.feed.updatedAt) <= Date.parse(snap.feed.updatedAt)) {
      // The CDN can lag the commit we already hold: never replace a newer feed.
      emit({ status: shaInvalid ? 'error' : 'stale-source', source: 'raw-fallback' });
    } else {
      // Pinned state belongs to the feed we just replaced; re-pin on the next API check.
      etag = null;
      lastSha = null;
      shaInvalid = false;
      const lastUpdated = Date.parse(doc.feed.updatedAt);
      emit({ feed: doc.feed, lastUpdated, status: 'stale-source', source: 'raw-fallback' });
    }
    return Math.max(1000, Math.min(BASE_INTERVAL_MS, apiNotBefore - now));
  }

  async function pollApi(): Promise<number> {
    const headers: Record<string, string> = { Accept: 'application/vnd.github.sha' };
    if (etag) headers['If-None-Match'] = etag;
    const r = await get(apiUrl, headers);
    const now = clock.now();

    if (r.status === 403 || r.status === 429) {
      startFallback(r.headers, now);
      return pollFallback();
    }
    let delay = budgetInterval(r.headers, now);
    // The budget ran out: use this answer, then read raw until the reset.
    if (r.headers.get('X-RateLimit-Remaining') === '0') {
      startFallback(r.headers, now);
      delay = BASE_INTERVAL_MS;
    } else if (delay > MAX_API_DELAY_MS) {
      // Stretched budget: keep the page fresh from raw main between API checks.
      apiNotBefore = now + delay;
      delay = BASE_INTERVAL_MS;
    }

    if (r.status === 304) {
      if (shaInvalid) emit({ status: 'error', source: 'api' });
      else emit({ lastUpdated: now, status: 'live', source: 'api' });
      return delay;
    }
    if (!r.ok) {
      emit({ status: 'error', source: 'api', error: `HTTP ${r.status} from the commits API` });
      return delay;
    }

    let sha: string;
    try {
      sha = (await r.text()).trim();
    } catch {
      throw new Offline();
    }
    if (!SHA_RE.test(sha)) {
      emit({ status: 'error', source: 'api', error: 'unexpected commits API answer' });
      return delay;
    }
    if (sha === lastSha && snap.feed && !shaInvalid) {
      emit({ lastUpdated: now, status: 'live', source: 'api' });
      return delay;
    }

    const doc = await fetchDoc(rawUrl(sha));
    if ('feed' in doc) {
      lastSha = sha;
      etag = r.headers.get('ETag') ?? `"${sha}"`;
      shaInvalid = false;
      emit({ feed: doc.feed, lastUpdated: clock.now(), status: 'live', source: 'api' });
    } else if (doc.transient) {
      // Keep the old ETag so the next check sees this commit as new and retries.
      emit({ status: 'error', source: 'api', error: doc.error });
    } else {
      // The commit itself is bad: remember it so it is not refetched every poll.
      lastSha = sha;
      etag = r.headers.get('ETag') ?? `"${sha}"`;
      shaInvalid = true;
      emit({ status: 'error', source: 'api', error: doc.error });
    }
    return delay;
  }

  async function tick() {
    if (!running || inFlight || visibility.hidden()) return;
    inFlight = true;
    lastTickAt = clock.now();
    let delay: number;
    try {
      delay = clock.now() < apiNotBefore ? await pollFallback() : await pollApi();
      failures = 0;
    } catch (err) {
      if (err instanceof Offline) {
        failures++;
        delay = Math.min(BASE_INTERVAL_MS * 2 ** (failures - 1), MAX_BACKOFF_MS);
        if (running) emit({ status: 'offline' });
      } else {
        // Never let an unexpected failure stop the polling loop.
        delay = BASE_INTERVAL_MS;
        if (running) emit({ status: 'error', error: String(err) });
      }
    } finally {
      inFlight = false;
    }
    nextAt = clock.now() + delay;
    if (running && !visibility.hidden()) schedule(delay);
  }

  function onVisibility() {
    if (!running) return;
    if (visibility.hidden()) {
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
    } else if (snap.status === 'offline') {
      // Back online (or back in the tab) after failures: retry soon, not after the backoff,
      // but never faster than the gap, so flapping events cannot hammer the network.
      failures = 0;
      schedule(Math.max(0, lastTickAt + OFFLINE_RETRY_GAP_MS - clock.now()));
    } else {
      // Rapid tab switches must not burn the API budget: wait for the poll already due.
      schedule(Math.max(0, nextAt - clock.now()));
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      unsubscribe = visibility.subscribe(onVisibility);
      options.onChange(snap);
      void tick();
    },
    stop() {
      running = false;
      unsubscribe();
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
    },
  };
}
