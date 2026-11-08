# The Hideout: architecture

A static site (Vite + React + TypeScript + React Three Fiber + drei) served from
GitHub Pages at `https://profmoriartey.github.io/hideout/` (Vite `base: '/hideout/'`).
It renders a voxel hideout and lights rooms from a live feed in
`ProfMoriartey/hideout-status`.

## Feed: how the site reads it (verified 2026-11-08)

Measured from a test branch:

| Method | Result |
|---|---|
| `raw.githubusercontent.com/.../main/status.json?t=<now>` | Query string is ignored by the CDN (`x-cache: HIT`), `max-age=300`. A push showed up after **305 s**. Too slow. |
| `raw.githubusercontent.com/.../<commit-sha>/status.json` | New URL per commit, so never cached stale. Fresh **immediately** after push. CORS `*`. |
| `api.github.com/repos/.../commits/main` with `Accept: application/vnd.github.sha` | 40-byte body (the SHA), `ETag` = SHA, `If-None-Match` returns **304**. CORS `*`, rate-limit headers exposed. |

Chosen method (`src/feed/source.ts`):

1. Poll `GET https://api.github.com/repos/ProfMoriartey/hideout-status/commits/main`
   with `Accept: application/vnd.github.sha` and `If-None-Match: "<last sha>"`.
2. On 200 with a new SHA, fetch `https://raw.githubusercontent.com/ProfMoriartey/hideout-status/<sha>/status.json`.
3. Interval: 30 s while the tab is visible, paused while hidden (`visibilitychange`),
   one immediate poll on becoming visible. Unauthenticated API budget is 60/h per IP,
   so the interval is stretched from the response headers:
   `interval = max(30 s, (X-RateLimit-Reset - now) / max(X-RateLimit-Remaining - 2, 1))`.
   Worst case (several tabs, 304s counted) is about one check per 60 s, which still
   meets the ~60 s freshness target for a single viewer. The reset time is clamped
   to 0..1 h (a skewed phone clock cannot stall the page); checks further apart than
   120 s read raw main in between. A tab switch never polls before the poll already due.
4. If the API answers 403/429 or the budget is 0, fall back until the reset to
   `raw.githubusercontent.com/.../main/status.json` (up to 5 min stale) and say so
   in the "updated" indicator. Raw main never replaces a newer feed (`updatedAt`),
   and the pinned SHA/ETag is dropped when it is used, so the next API check refetches.
   A failed raw@sha fetch (5xx/404/429) keeps the old ETag and is retried.
5. Network errors: keep the last good feed, show the offline state, back off
   30 s -> 60 s -> 120 s (cap), recover on the next success.
6. Every fetched document is validated (`src/feed/validate.ts`) against the same
   rules as the feed schema; anything invalid is dropped, never rendered.

One poller per page: `src/feed/store.ts` is a singleton started by the first
subscriber and stopped by the last. Scene code reads `useMember(id)` /
`useFeedStatus()` (re-render only on change); `useFeed()` and `useNow()` tick every
second, so they belong in leaf DOM text, never in the Canvas tree. Names come
through `store.setNameOf` (the lead wires `src/config/members.ts` at integration).

`?demo=1` (optional `&seed=<n>&origin=<epoch ms>`) swaps the source for a local fake feed (`src/feed/demo.ts`) that cycles
members through all states, several at once, plus missions and events.

## Feed contract (v1)

The schema lives in `hideout-status/schema/status.schema.json`; allowlists in
`hideout-status/schema/allowlist.json` and `missions.allow`. TypeScript mirror
(`src/feed/types.ts`):

```ts
export type MemberId =
  | 'chrollo' | 'elders' | 'pakunoda' | 'shalnark' | 'kortopi' | 'phinks' | 'feitan'
  | 'machi' | 'nobunaga' | 'franklin' | 'shizuku' | 'bonolenov' | 'kalluto';
export type Count = { done: number; total: number };
export type FeedMemberState = 'idle' | 'working' | 'done';
export type MemberStatus = {
  state: FeedMemberState; since: string; updatedAt?: string; verb?: string; mission?: string; progress?: Count;
};
export type Mission = {
  codename: string; state: 'active' | 'done'; startedAt: string; endedAt?: string; tickets?: Count;
};
export type FeedEvent = {
  at: string; who: MemberId;
  kind: 'start' | 'progress' | 'done' | 'mission-start' | 'mission-progress' | 'mission-done';
  verb?: string; mission?: string;
};
export type StatusFeed = {
  version: 1; updatedAt: string; missions: Mission[];
  members: Partial<Record<MemberId, MemberStatus>>; events: FeedEvent[]; // events newest first, max 20
};
```

Events carry no text. The site builds it: `start` -> "Feitan started interrogating",
`done` -> "Feitan finished interrogating", `mission-start` -> "Operation Silk Lantern started".

Display state (derived on the client, `src/feed/derive.ts`):
- `working` and `updatedAt` (fallback `since`) older than 3 h -> **stale** (idle look plus a small "?").
  `since` is when the current state began ("running 42 min"); `updatedAt` is the last write.
- `done` and `since` within the last 8 s, or a working -> done change seen live -> **done**
  celebration for ~3 s, then **idle**.
- Otherwise `idle` / `working` as given. Missing member -> idle.

## Source layout and ticket ownership

Parallel tickets only touch their own files. Shared files are changed only by the
ticket that owns them; others ask the lead.

| Path | Owner ticket |
|---|---|
| `package.json`, `vite.config.ts`, `tsconfig*.json`, lint config, `playwright.config.ts`, `.github/workflows/*`, `index.html`, `src/main.tsx` | 1 Scaffold |
| `src/feed/*` (types, source, validate, derive, demo, `useFeed.ts`) | 2 Feed contract |
| `src/config/members.ts` (ids, names, roles, plaques, room slots, colours), `src/scene/Hideout.tsx`, `src/scene/voxel/*`, `src/scene/CameraRig.tsx` | 3 Structure |
| `src/scene/members/*` (one file per member: figure, prop, work loop), `src/scene/RoomLights.tsx` | 4 Members |
| `src/scene/Labels.tsx`, `src/ui/RoomPanel.tsx` | 5 Labels and panel |
| `src/ui/MissionBanner.tsx`, `src/ui/Ticker.tsx`, `src/ui/Freshness.tsx`, `src/ui/Footer.tsx`, `src/config/site.ts` (`PORTFOLIO_URL`) | 6 Global UI |
| `src/audio/*`, `public/audio/*`, `src/ui/SoundToggle.tsx` | 7 Sound |
| `src/perf/*` (quality tiers, fps monitor), DPR settings in `src/App.tsx` | 8 Performance |
| `src/App.tsx` composition | 1 creates; 3-8 each add one line via the lead's merge |
| `e2e/*` | Feitan (each ticket adds its own spec file) |

## Performance budget (phone first)

- Target 50-60 fps on a mid-range phone; DPR capped at 1.5 on mobile, 2 on desktop.
- Voxels: one `InstancedMesh` per material (or merged static geometry per room).
  Target under ~60 draw calls for the whole scene in high quality, under ~30 in low.
- Lighting: baked colours plus emissive "lantern" materials and at most a few real
  lights; room glow done with emissive intensity, not one light per room.
- No post-processing on mobile. No shadows maps in low quality.
- Quality tiers (`src/perf`): start high on desktop, medium on mobile; drop a tier
  when average fps < 45 for 3 s; never bounce back up more than once.
- JS bundle: three + R3F code-split behind a loading screen; first-paint HTML+CSS
  tiny; audio loaded only after the user turns sound on.
- `prefers-reduced-motion`: no camera drift, no particles, celebrations become a
  short static glow.

## Privacy

The site renders only member codenames, fixed role/plaque copy from
`src/config/members.ts`, allowlisted verbs, mission codenames and counts. Unknown
member ids or values failing validation are ignored.
