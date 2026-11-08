import { describe, expect, it } from 'vitest';
import {
  BASE_INTERVAL_MS,
  createFeedSource,
  type Clock,
  type FeedSnapshot,
  type FetchLike,
  type ResponseLike,
  type Visibility,
} from './source';
import type { StatusFeed } from './types';

const START = Date.parse('2026-11-08T12:00:00Z');
const SHA1 = 'a'.repeat(40);
const SHA2 = 'b'.repeat(40);
const CONFIG = {
  owner: 'Owner',
  repo: 'status',
  branch: 'main',
  path: 'status.json',
  apiBase: 'https://api.test',
  rawBase: 'https://raw.test',
};
const API = 'https://api.test/repos/Owner/status/commits/main';
const RAW_MAIN = 'https://raw.test/Owner/status/main/status.json';
const raw = (sha: string) => `https://raw.test/Owner/status/${sha}/status.json`;

function doc(updatedAt: string, verb = 'forging'): StatusFeed {
  return {
    version: 1,
    updatedAt,
    missions: [],
    members: { phinks: { state: 'working', since: updatedAt, verb } },
    events: [],
  };
}

function res(status: number, body = '', headers: Record<string, string> = {}): ResponseLike {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (n) => h.get(n.toLowerCase()) ?? null },
    text: async () => body,
  };
}

const json = (f: unknown) => res(200, JSON.stringify(f));
const limits = (remaining: number, resetInS: number, now: number) => ({
  'X-RateLimit-Remaining': String(remaining),
  'X-RateLimit-Reset': String(Math.floor(now / 1000) + resetInS),
});

class FakeClock implements Clock {
  t = START;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 1;
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => {
    const id = this.nextId++;
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  };
  clearTimeout = (id: unknown) => {
    this.timers = this.timers.filter((t) => t.id !== id);
  };
  async advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      await flush();
      const due = this.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.t = due.at;
      due.fn();
    }
    this.t = end;
    await flush();
  }
}

async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

class FakeVisibility implements Visibility {
  isHidden = false;
  private cbs = new Set<() => void>();
  hidden = () => this.isHidden;
  subscribe = (cb: () => void) => {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  };
  set(hidden: boolean) {
    this.isHidden = hidden;
    this.cbs.forEach((cb) => cb());
  }
}

type Handler = (
  url: string,
  headers: Record<string, string>,
) => ResponseLike | Promise<ResponseLike>;

function setup(handler: Handler) {
  const clock = new FakeClock();
  const visibility = new FakeVisibility();
  const calls: { url: string; at: number; headers: Record<string, string> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    const headers = init?.headers ?? {};
    calls.push({ url, at: clock.t, headers });
    return handler(url, headers);
  };
  const snaps: FeedSnapshot[] = [];
  const source = createFeedSource({
    config: CONFIG,
    fetch,
    clock,
    visibility,
    onChange: (s) => snaps.push(s),
  });
  const last = () => snaps[snaps.length - 1] as FeedSnapshot;
  const apiCalls = () => calls.filter((c) => c.url === API);
  return { clock, visibility, calls, apiCalls, snaps, last, source };
}

describe('feed source', () => {
  it('starts loading, then goes live from the SHA, 304s keep it, a new SHA refetches', async () => {
    let sha = SHA1;
    const t = setup((url, headers) => {
      if (url === API)
        return headers['If-None-Match'] === `"${sha}"`
          ? res(304)
          : res(200, sha, { ETag: `"${sha}"` });
      if (url === raw(SHA1)) return json(doc('2026-11-08T11:00:00Z'));
      if (url === raw(SHA2)) return json(doc('2026-11-08T12:00:30Z', 'wiring'));
      return res(404);
    });
    t.source.start();
    expect(t.snaps[0]).toMatchObject({ status: 'loading', feed: null, source: 'api' });
    await t.clock.advance(0);
    expect(t.calls.map((c) => c.url)).toEqual([API, raw(SHA1)]);
    expect(t.calls[0]?.headers.Accept).toBe('application/vnd.github.sha');
    expect(t.calls[0]?.headers['If-None-Match']).toBeUndefined();
    expect(t.last()).toMatchObject({ status: 'live', source: 'api', lastUpdated: START });
    expect(t.last().feed?.members.phinks?.verb).toBe('forging');

    await t.clock.advance(BASE_INTERVAL_MS);
    expect(t.calls).toHaveLength(3);
    expect(t.calls[2]).toMatchObject({ url: API, at: START + 30_000 });
    expect(t.calls[2]?.headers['If-None-Match']).toBe(`"${SHA1}"`);
    expect(t.last()).toMatchObject({ status: 'live', lastUpdated: START + 30_000 });

    sha = SHA2;
    await t.clock.advance(BASE_INTERVAL_MS);
    expect(t.calls.slice(3).map((c) => c.url)).toEqual([API, raw(SHA2)]);
    expect(t.last().feed?.members.phinks?.verb).toBe('wiring');
    t.source.stop();
  });

  it('stretches the interval from the rate-limit headers', async () => {
    const t = setup((url, headers) => {
      if (url === API) {
        const h = { ETag: `"${SHA1}"`, ...limits(12, 600, START) };
        return headers['If-None-Match'] ? res(304, '', h) : res(200, SHA1, h);
      }
      return json(doc('2026-11-08T11:00:00Z'));
    });
    t.source.start();
    await t.clock.advance(0);
    // 600 s left / (12 - 2) requests = 60 s between checks.
    await t.clock.advance(59_999);
    expect(t.apiCalls()).toHaveLength(1);
    await t.clock.advance(1);
    expect(t.apiCalls()).toHaveLength(2);
    t.source.stop();
  });

  it('never polls faster than 30 s even with plenty of budget', async () => {
    const t = setup((url) =>
      url === API ? res(200, SHA1, limits(60, 60, START)) : json(doc('2026-11-08T11:00:00Z')),
    );
    t.source.start();
    await t.clock.advance(29_999);
    expect(t.apiCalls()).toHaveLength(1);
    await t.clock.advance(1);
    expect(t.apiCalls()).toHaveLength(2);
    t.source.stop();
  });

  it('falls back to raw main on 403 until the reset, then recovers', async () => {
    let limited = true;
    const t = setup((url) => {
      if (url === API) {
        return limited
          ? res(403, '{}', limits(0, 90, START))
          : res(200, SHA1, limits(50, 3000, START));
      }
      if (url === RAW_MAIN) return json(doc('2026-11-08T11:00:00Z', 'fixing'));
      if (url === raw(SHA1)) return json(doc('2026-11-08T11:30:00Z', 'wiring'));
      return res(404);
    });
    t.source.start();
    await t.clock.advance(0);
    expect(t.calls.map((c) => c.url)).toEqual([API, RAW_MAIN]);
    expect(t.last()).toMatchObject({ status: 'stale-source', source: 'raw-fallback' });
    expect(t.last().feed?.members.phinks?.verb).toBe('fixing');

    // Before the reset only raw main is read.
    await t.clock.advance(60_000);
    expect(t.apiCalls()).toHaveLength(1);
    expect(t.calls.filter((c) => c.url === RAW_MAIN)).toHaveLength(3);

    limited = false;
    await t.clock.advance(30_000);
    expect(t.apiCalls()).toHaveLength(2);
    expect(t.last()).toMatchObject({ status: 'live', source: 'api' });
    expect(t.last().feed?.members.phinks?.verb).toBe('wiring');
    t.source.stop();
  });

  it('treats 429 like 403', async () => {
    const t = setup((url) => (url === API ? res(429) : json(doc('2026-11-08T11:00:00Z'))));
    t.source.start();
    await t.clock.advance(0);
    expect(t.last()).toMatchObject({ status: 'stale-source', source: 'raw-fallback' });
    t.source.stop();
  });

  it('uses the 200 it got, then switches to the fallback when the budget hits 0', async () => {
    const t = setup((url) => {
      if (url === API) return res(200, SHA1, limits(0, 600, START));
      return json(doc('2026-11-08T11:00:00Z'));
    });
    t.source.start();
    await t.clock.advance(0);
    expect(t.calls.map((c) => c.url)).toEqual([API, raw(SHA1)]);
    expect(t.last().status).toBe('live');
    await t.clock.advance(30_000);
    expect(t.calls.map((c) => c.url)).toEqual([API, raw(SHA1), RAW_MAIN]);
    expect(t.last()).toMatchObject({ status: 'stale-source', source: 'raw-fallback' });
    t.source.stop();
  });

  it('goes offline on network errors, keeps the feed, backs off 30/60/120 s and recovers', async () => {
    let down = false;
    const t = setup((url, headers) => {
      if (down) throw new TypeError('Failed to fetch');
      if (url === API) return headers['If-None-Match'] ? res(304) : res(200, SHA1);
      return json(doc('2026-11-08T11:00:00Z'));
    });
    t.source.start();
    await t.clock.advance(0);
    expect(t.last().status).toBe('live');

    down = true;
    await t.clock.advance(30_000); // poll at +30 fails
    expect(t.last()).toMatchObject({ status: 'offline', lastUpdated: START });
    expect(t.last().feed?.members.phinks?.verb).toBe('forging');
    const failTimes = () =>
      t
        .apiCalls()
        .slice(1)
        .map((c) => (c.at - START) / 1000);
    await t.clock.advance(30_000 + 60_000 + 120_000 + 120_000);
    expect(failTimes()).toEqual([30, 60, 120, 240, 360]);

    down = false;
    await t.clock.advance(120_000);
    expect(t.last()).toMatchObject({ status: 'live', lastUpdated: START + 480_000 });
    await t.clock.advance(30_000);
    expect(failTimes().slice(-1)[0]).toBe(510);
    t.source.stop();
  });

  it('pauses while hidden and polls immediately when visible again', async () => {
    const t = setup((url, headers) => {
      if (url === API) return headers['If-None-Match'] ? res(304) : res(200, SHA1);
      return json(doc('2026-11-08T11:00:00Z'));
    });
    t.source.start();
    await t.clock.advance(0);
    t.visibility.set(true);
    await t.clock.advance(10 * 60_000);
    expect(t.apiCalls()).toHaveLength(1);
    t.visibility.set(false);
    await t.clock.advance(0);
    expect(t.apiCalls()).toHaveLength(2);
    expect(t.apiCalls()[1]?.at).toBe(START + 10 * 60_000);
    await t.clock.advance(30_000);
    expect(t.apiCalls()).toHaveLength(3);
    t.source.stop();
  });

  it('does not poll on start while hidden', async () => {
    const t = setup(() => res(200, SHA1));
    t.visibility.isHidden = true;
    t.source.start();
    await t.clock.advance(60_000);
    expect(t.calls).toHaveLength(0);
    t.source.stop();
  });

  it('drops invalid documents, keeps the last good feed and reports an error', async () => {
    let sha = SHA1;
    const t = setup((url, headers) => {
      if (url === API) return headers['If-None-Match'] === `"${sha}"` ? res(304) : res(200, sha);
      if (url === raw(SHA1)) return json(doc('2026-11-08T11:00:00Z'));
      return res(200, JSON.stringify({ ...doc('2026-11-08T11:00:00Z'), note: 'free text' }));
    });
    t.source.start();
    await t.clock.advance(0);
    sha = SHA2;
    await t.clock.advance(30_000);
    expect(t.last().status).toBe('error');
    expect(t.last().feed?.members.phinks?.verb).toBe('forging');
    // The bad commit is remembered, so it is not fetched again.
    await t.clock.advance(30_000);
    expect(t.calls.filter((c) => c.url === raw(SHA2))).toHaveLength(1);
    expect(t.last().status).toBe('error');
    t.source.stop();
  });

  it('rejects malformed JSON and odd SHA bodies', async () => {
    const t = setup((url) => (url === API ? res(200, '<html>') : res(200, '{')));
    t.source.start();
    await t.clock.advance(0);
    expect(t.last()).toMatchObject({ status: 'error', feed: null });
    t.source.stop();
  });

  it('retries a transient raw@sha failure instead of pinning the commit as bad', async () => {
    let rawOk = false;
    const t = setup((url, headers) => {
      if (url === API) {
        return headers['If-None-Match'] === `"${SHA2}"`
          ? res(304)
          : res(200, SHA2, { ETag: `"${SHA2}"` });
      }
      if (url === raw(SHA2)) return rawOk ? json(doc('2026-11-08T12:00:00Z')) : res(503);
      return res(404);
    });
    t.source.start();
    await t.clock.advance(0);
    expect(t.last()).toMatchObject({ status: 'error', feed: null });
    expect(t.last().error).toBe('HTTP 503 for status.json');
    rawOk = true;
    await t.clock.advance(30_000);
    expect(t.apiCalls()[1]?.headers['If-None-Match']).toBeUndefined();
    expect(t.last()).toMatchObject({ status: 'live' });
    expect(t.last().feed).not.toBeNull();
    // Now pinned: the next check is a 304 and stays live.
    await t.clock.advance(30_000);
    expect(t.apiCalls()[2]?.headers['If-None-Match']).toBe(`"${SHA2}"`);
    expect(t.last().status).toBe('live');
    t.source.stop();
  });

  it('keeps retrying after raw@sha 404 and 429 with the old ETag', async () => {
    let code = 404;
    let sha = SHA1;
    const t = setup((url, headers) => {
      if (url === API) {
        return headers['If-None-Match'] === `"${sha}"`
          ? res(304)
          : res(200, sha, { ETag: `"${sha}"` });
      }
      if (url === raw(SHA1)) return json(doc('2026-11-08T11:00:00Z'));
      return code === 200 ? json(doc('2026-11-08T12:00:30Z', 'wiring')) : res(code);
    });
    t.source.start();
    await t.clock.advance(0);
    sha = SHA2;
    await t.clock.advance(30_000);
    expect(t.last()).toMatchObject({ status: 'error' });
    expect(t.last().feed?.members.phinks?.verb).toBe('forging');
    code = 429;
    await t.clock.advance(30_000);
    expect(
      t
        .apiCalls()
        .slice(1)
        .map((c) => c.headers['If-None-Match']),
    ).toEqual([`"${SHA1}"`, `"${SHA1}"`]);
    code = 200;
    await t.clock.advance(30_000);
    expect(t.last().status).toBe('live');
    expect(t.last().feed?.members.phinks?.verb).toBe('wiring');
    t.source.stop();
  });

  it('never replaces a newer feed with an older raw-main answer, and re-pins after the fallback', async () => {
    let limited = false;
    const t = setup((url, headers) => {
      if (url === API) {
        if (limited) return res(403, '{}', limits(0, 60, t.clock.t));
        return headers['If-None-Match'] === `"${SHA2}"`
          ? res(304)
          : res(200, SHA2, { ETag: `"${SHA2}"` });
      }
      if (url === raw(SHA2)) return json(doc('2026-11-08T12:00:30Z', 'wiring'));
      if (url === RAW_MAIN) return json(doc('2026-11-08T11:55:00Z', 'fixing'));
      return res(404);
    });
    t.source.start();
    await t.clock.advance(0);
    expect(t.last().feed?.members.phinks?.verb).toBe('wiring');
    limited = true;
    await t.clock.advance(30_000);
    expect(t.last()).toMatchObject({ status: 'stale-source', source: 'raw-fallback' });
    expect(t.last().feed?.members.phinks?.verb).toBe('wiring');
    // The fallback ended: a 304 must not relabel an older feed as live.
    limited = false;
    await t.clock.advance(60_000);
    expect(t.last()).toMatchObject({ status: 'live', source: 'api' });
    expect(t.last().feed?.members.phinks?.verb).toBe('wiring');
    t.source.stop();
  });

  it('replaces an older feed from raw main and reports its own updatedAt', async () => {
    const t = setup((url) =>
      url === API ? res(429) : json(doc('2026-11-08T11:58:00Z', 'fixing')),
    );
    t.source.start();
    await t.clock.advance(0);
    expect(t.last().lastUpdated).toBe(Date.parse('2026-11-08T11:58:00Z'));
    t.source.stop();
  });

  it('rejects done greater than total from the feed', async () => {
    const bad = doc('2026-11-08T11:00:00Z');
    const t = setup((url) =>
      url === API
        ? res(200, SHA1)
        : json({
            ...bad,
            missions: [
              {
                codename: 'Silk',
                state: 'active',
                startedAt: bad.updatedAt,
                tickets: { done: 5, total: 3 },
              },
            ],
          }),
    );
    t.source.start();
    await t.clock.advance(0);
    expect(t.last()).toMatchObject({ status: 'error', feed: null });
    t.source.stop();
  });

  it('does not echo the feed content into the error', async () => {
    const t = setup((url) =>
      url === API ? res(200, SHA1) : json({ ...doc('2026-11-08T11:00:00Z'), '<script>evil': 1 }),
    );
    t.source.start();
    await t.clock.advance(0);
    expect(t.last().status).toBe('error');
    expect(t.last().error).not.toContain('evil');
    t.source.stop();
  });

  it('ignores a skewed reset header: a day-slow client clock does not stall the page', async () => {
    const t = setup((url, headers) => {
      if (url === API) {
        const h = { ETag: `"${SHA1}"`, ...limits(30, 86_400, START) };
        return headers['If-None-Match'] ? res(304, '', h) : res(200, SHA1, h);
      }
      return json(doc('2026-11-08T11:00:00Z'));
    });
    t.source.start();
    await t.clock.advance(0);
    // Clamped to 3600 s / 28 = ~129 s, above the 120 s cap: raw main in between.
    await t.clock.advance(120_000);
    expect(t.last().status).toBe('stale-source');
    expect(t.calls.filter((c) => c.url === RAW_MAIN).length).toBeGreaterThanOrEqual(3);
    expect(t.apiCalls()).toHaveLength(1);
    await t.clock.advance(20_000);
    expect(t.apiCalls()).toHaveLength(2);
    expect(t.apiCalls()[1]?.at).toBeLessThanOrEqual(START + 140_000);
    t.source.stop();
  });

  it('honours Retry-After on a 429', async () => {
    const t = setup((url) =>
      url === API ? res(429, '', { 'Retry-After': '300' }) : json(doc('2026-11-08T11:00:00Z')),
    );
    t.source.start();
    await t.clock.advance(290_000);
    expect(t.apiCalls()).toHaveLength(1);
    await t.clock.advance(40_000);
    expect(t.apiCalls()).toHaveLength(2);
    t.source.stop();
  });

  it('rapid visibility toggles do not burn the API budget', async () => {
    const t = setup((url, headers) => {
      if (url === API) return headers['If-None-Match'] ? res(304) : res(200, SHA1);
      return json(doc('2026-11-08T11:00:00Z'));
    });
    t.source.start();
    await t.clock.advance(0);
    for (let i = 0; i < 20; i++) {
      await t.clock.advance(500);
      t.visibility.set(true);
      t.visibility.set(false);
    }
    await t.clock.advance(0);
    expect(t.apiCalls()).toHaveLength(1);
    await t.clock.advance(20_000);
    expect(t.apiCalls()).toHaveLength(2);
    expect(t.apiCalls()[1]?.at).toBe(START + 30_000);
    t.source.stop();
  });

  it('retries at once when the network returns while offline', async () => {
    let down = true;
    const t = setup((url, headers) => {
      if (down) throw new TypeError('Failed to fetch');
      if (url === API) return headers['If-None-Match'] ? res(304) : res(200, SHA1);
      return json(doc('2026-11-08T11:00:00Z'));
    });
    t.source.start();
    await t.clock.advance(0);
    expect(t.last().status).toBe('offline');
    down = false;
    t.visibility.set(false); // the 'online' event reaches the same callback
    await t.clock.advance(0);
    expect(t.last().status).toBe('live');
    expect(t.apiCalls()[1]?.at).toBe(START);
    t.source.stop();
  });

  it('emits nothing after stop() even when a request is still in flight', async () => {
    let release: () => void = () => {};
    const t = setup((url) =>
      url === API
        ? new Promise<ResponseLike>((r) => {
            release = () => r(res(200, SHA1));
          })
        : json(doc('2026-11-08T11:00:00Z')),
    );
    t.source.start();
    await t.clock.advance(0);
    const n = t.snaps.length;
    t.source.stop();
    release();
    await t.clock.advance(1000);
    expect(t.snaps).toHaveLength(n);
  });

  it('stops polling after stop()', async () => {
    const t = setup((url) => (url === API ? res(200, SHA1) : json(doc('2026-11-08T11:00:00Z'))));
    t.source.start();
    await t.clock.advance(0);
    t.source.stop();
    t.visibility.set(true);
    t.visibility.set(false);
    await t.clock.advance(10 * 60_000);
    expect(t.apiCalls()).toHaveLength(1);
  });
});
