// Turns a validated feed into what the scene and UI render.
import { MEMBER_IDS } from './validate';
import type {
  Count,
  FeedEvent,
  FeedMemberState,
  MemberId,
  MemberStatus,
  Mission,
  StatusFeed,
} from './types';

export type DisplayState = 'idle' | 'working' | 'done' | 'stale';

/** Working with no write (updatedAt, else since) for longer than this shows as stale. */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000;
/** A done whose `since` is newer than this still celebrates (e.g. on page load). */
export const RECENT_DONE_MS = 8000;
/** Length of the celebration for a working -> done change seen live. */
export const CELEBRATE_MS = 3000;
export const TICKER_SIZE = 10;

/** Member id -> end of its live celebration window (epoch ms). */
export type Celebrations = Partial<Record<MemberId, number>>;
export type NameOf = (id: MemberId) => string;

export type MemberView = {
  id: MemberId;
  name: string;
  display: DisplayState;
  /** State as given by the feed (missing member -> idle). */
  state: FeedMemberState;
  since: number | null;
  verb?: string;
  mission?: string;
  progress?: Count;
  /** Time since the member started working, while working or stale. */
  runningForMs: number | null;
  runningFor: string | null;
};

export type MissionView = {
  codename: string;
  state: Mission['state'];
  label: string;
  tickets?: Count;
  startedAt: number;
  endedAt?: number;
  runningForMs: number;
  runningFor: string;
};

export type TickerLine = { key: string; at: number; text: string; ago: string };

export type Derived = {
  members: Record<MemberId, MemberView>;
  workingCount: number;
  missions: MissionView[];
  banner: MissionView | null;
  ticker: TickerLine[];
};

export const defaultName: NameOf = (id) => id.charAt(0).toUpperCase() + id.slice(1);

export function displayState(
  status: MemberStatus | undefined,
  now: number,
  celebrateUntil?: number,
): DisplayState {
  if (!status) return 'idle';
  const age = now - Date.parse(status.since);
  switch (status.state) {
    case 'idle':
      return 'idle';
    case 'working': {
      // Stale counts from the last write, so long jobs with progress stay lit.
      const quiet = now - Date.parse(status.updatedAt ?? status.since);
      return quiet > STALE_AFTER_MS ? 'stale' : 'working';
    }
    case 'done':
      if (age < RECENT_DONE_MS) return 'done';
      return celebrateUntil !== undefined && now < celebrateUntil ? 'done' : 'idle';
    default: {
      const never: never = status.state;
      return never;
    }
  }
}

/**
 * Opens a celebration window for every member that changed from working to
 * done between two feeds seen live, and drops windows that have ended.
 */
export function trackCelebrations(
  prev: StatusFeed | null,
  next: StatusFeed,
  now: number,
  current: Celebrations,
): Celebrations {
  const out: Celebrations = {};
  for (const id of MEMBER_IDS) {
    const until = current[id];
    if (until !== undefined && until > now) out[id] = until;
    if (prev && prev.members[id]?.state === 'working' && next.members[id]?.state === 'done') {
      out[id] = now + CELEBRATE_MS;
    }
  }
  return out;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function formatAgo(ms: number): string {
  return ms < 60_000 ? 'just now' : `${formatDuration(ms)} ago`;
}

export function eventText(e: FeedEvent, nameOf: NameOf = defaultName): string {
  const who = nameOf(e.who);
  const op = e.mission ? `Operation ${e.mission}` : 'Operation';
  switch (e.kind) {
    case 'start':
      return e.verb ? `${who} started ${e.verb}` : `${who} started work`;
    case 'progress':
      return e.verb ? `${who} is still ${e.verb}` : `${who} made progress`;
    case 'done':
      return e.verb ? `${who} finished ${e.verb}` : `${who} finished`;
    case 'mission-start':
      return `${op} started`;
    case 'mission-progress':
      return `${op} moved forward`;
    case 'mission-done':
      return `${op} complete`;
    default: {
      const never: never = e.kind;
      return never;
    }
  }
}

function memberView(
  id: MemberId,
  status: MemberStatus | undefined,
  now: number,
  celebrateUntil: number | undefined,
  nameOf: NameOf,
): MemberView {
  const display = displayState(status, now, celebrateUntil);
  const since = status ? Date.parse(status.since) : null;
  const running = since !== null && (display === 'working' || display === 'stale');
  const runningForMs = running ? Math.max(0, now - since) : null;
  const view: MemberView = {
    id,
    name: nameOf(id),
    display,
    state: status?.state ?? 'idle',
    since,
    runningForMs,
    runningFor: runningForMs === null ? null : formatDuration(runningForMs),
  };
  if (status?.verb !== undefined) view.verb = status.verb;
  if (status?.mission !== undefined) view.mission = status.mission;
  if (status?.progress !== undefined) view.progress = status.progress;
  return view;
}

function missionView(m: Mission, now: number): MissionView {
  const startedAt = Date.parse(m.startedAt);
  const endedAt = m.endedAt === undefined ? undefined : Date.parse(m.endedAt);
  const runningForMs = Math.max(0, (endedAt ?? now) - startedAt);
  const count = m.tickets ? ` - ${m.tickets.done}/${m.tickets.total}` : '';
  const view: MissionView = {
    codename: m.codename,
    state: m.state,
    label: `Operation ${m.codename}${count}`,
    startedAt,
    runningForMs,
    runningFor: formatDuration(runningForMs),
  };
  if (endedAt !== undefined) view.endedAt = endedAt;
  if (m.tickets) view.tickets = m.tickets;
  return view;
}

export function derive(
  feed: StatusFeed | null,
  celebrations: Celebrations,
  now: number,
  nameOf: NameOf = defaultName,
): Derived {
  const members = {} as Record<MemberId, MemberView>;
  let workingCount = 0;
  for (const id of MEMBER_IDS) {
    const view = memberView(id, feed?.members[id], now, celebrations[id], nameOf);
    if (view.display === 'working') workingCount++;
    members[id] = view;
  }

  // Active missions first, then the most recently started.
  const missions = (feed?.missions ?? [])
    .map((m) => missionView(m, now))
    .sort((a, b) =>
      a.state === b.state ? b.startedAt - a.startedAt : a.state === 'active' ? -1 : 1,
    );

  const ticker = (feed?.events ?? []).slice(0, TICKER_SIZE).map((e, i) => {
    const at = Date.parse(e.at);
    return {
      key: `${e.at}-${e.who}-${e.kind}-${i}`,
      at,
      text: eventText(e, nameOf),
      ago: formatAgo(now - at),
    };
  });

  return {
    members,
    workingCount,
    missions,
    banner: missions.find((m) => m.state === 'active') ?? null,
    ticker,
  };
}
