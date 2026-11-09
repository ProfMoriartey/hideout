// @vitest-environment node
// Fails when the site's member, verb and title lists differ from the feed's
// schema/allowlist.json on hideout-status main. Opt-in locally (needs network):
//   ALLOWLIST_SYNC=1 npx vitest run src/feed/allowlist.sync.test.ts
// CI runs it as its own step. Written by Chrollo.
import { describe, expect, it } from 'vitest';
import { MEMBER_IDS, TITLES, VERBS } from './validate';

const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const URL =
  'https://raw.githubusercontent.com/ProfMoriartey/hideout-status/main/schema/allowlist.json';

describe.skipIf(env.ALLOWLIST_SYNC !== '1')('allowlist sync', () => {
  it('site lists equal hideout-status schema/allowlist.json', async () => {
    const res = await fetch(URL, { signal: AbortSignal.timeout(20_000) });
    expect(res.status, `GET ${URL}`).toBe(200);
    const feed = (await res.json()) as Record<string, string[]>;
    const sorted = (a: readonly string[]) => [...a].sort();
    expect(sorted(MEMBER_IDS), 'members').toEqual(sorted(feed.members ?? []));
    expect(sorted(VERBS), 'verbs').toEqual(sorted(feed.verbs ?? []));
    expect(sorted(TITLES), 'titles').toEqual(sorted(feed.titles ?? []));
  });
});
