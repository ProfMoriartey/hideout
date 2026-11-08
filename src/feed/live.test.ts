// Opt-in check against the real feed: FEED_LIVE=1 npx vitest run src/feed/live.test.ts
// Optional FEED_BRANCH (default troupe/silk-lantern). A missing status.json is reported, not failed.
import { describe, expect, it } from 'vitest';
import { FEED_CONFIG, createFeedSource, type FeedSnapshot } from './source';

const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const live = env.FEED_LIVE === '1';

describe.skipIf(!live)('live feed', () => {
  it('reads and validates whatever the real feed returns', async () => {
    const branch = env.FEED_BRANCH ?? 'troupe/silk-lantern';
    const snap = await new Promise<FeedSnapshot>((resolve) => {
      const source = createFeedSource({
        config: { ...FEED_CONFIG, branch },
        visibility: { hidden: () => false, subscribe: () => () => {} },
        onChange: (s) => {
          if (s.status === 'loading') return;
          source.stop();
          resolve(s);
        },
      });
      source.start();
    });
    console.log(
      'live feed snapshot:',
      JSON.stringify({ ...snap, feed: snap.feed && '<valid feed>' }),
    );
    if (snap.status === 'error' && /HTTP 404/.test(snap.error ?? '')) return;
    expect(['live', 'stale-source']).toContain(snap.status);
    expect(snap.feed).not.toBeNull();
  }, 30_000);
});
