// Feed contract v1. Mirrors hideout-status/schema/status.schema.json.
// See docs/ARCHITECTURE.md ("Feed contract").

export type MemberId =
  | 'chrollo'
  | 'elders'
  | 'pakunoda'
  | 'shalnark'
  | 'kortopi'
  | 'phinks'
  | 'feitan'
  | 'machi'
  | 'nobunaga'
  | 'franklin'
  | 'shizuku'
  | 'bonolenov'
  | 'kalluto';
export type Count = { done: number; total: number };
export type FeedMemberState = 'idle' | 'working' | 'done';
export type MemberStatus = {
  state: FeedMemberState;
  since: string;
  updatedAt?: string;
  verb?: string;
  mission?: string;
  progress?: Count;
};
export type Mission = {
  codename: string;
  state: 'active' | 'done';
  startedAt: string;
  endedAt?: string;
  tickets?: Count;
};
export type FeedEvent = {
  at: string;
  who: MemberId;
  kind: 'start' | 'progress' | 'done' | 'mission-start' | 'mission-progress' | 'mission-done';
  verb?: string;
  mission?: string;
};
export type StatusFeed = {
  version: 1;
  updatedAt: string;
  missions: Mission[];
  members: Partial<Record<MemberId, MemberStatus>>;
  events: FeedEvent[]; // events newest first, max 20
};
