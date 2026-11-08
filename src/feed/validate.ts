// Zero-dependency validator for the status feed. Mirrors
// hideout-status/schema/status.schema.json and schema/allowlist.json.
// Invalid documents are rejected whole; unknown member ids are dropped.
import type { Count, FeedEvent, MemberId, MemberStatus, Mission, StatusFeed } from './types';

export const MEMBER_IDS: readonly MemberId[] = [
  'chrollo',
  'elders',
  'pakunoda',
  'shalnark',
  'kortopi',
  'phinks',
  'feitan',
  'machi',
  'nobunaga',
  'franklin',
  'shizuku',
  'bonolenov',
  'kalluto',
];

export const VERBS: readonly string[] = [
  'advising',
  'analyzing',
  'auditing',
  'briefing',
  'building',
  'cleaning',
  'crafting',
  'debating',
  'debugging',
  'deploying',
  'designing',
  'documenting',
  'drumming',
  'fixing',
  'folding',
  'forging',
  'guarding',
  'interrogating',
  'planning',
  'questioning',
  'reading',
  'refactoring',
  'researching',
  'reviewing',
  'scheduling',
  'sketching',
  'stitching',
  'testing',
  'tracking',
  'wiring',
];

export const MAX_EVENTS = 20;
export const MAX_MISSIONS = 10;

const TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const VERB_RE = /^[a-z]{3,20}$/;
const MISSION_RE = /^[A-Z][a-z]+( [A-Z][a-z]+){0,2}$/;
const MEMBER_STATES = ['idle', 'working', 'done'] as const;
const MISSION_STATES = ['active', 'done'] as const;
const EVENT_KINDS = [
  'start',
  'progress',
  'done',
  'mission-start',
  'mission-progress',
  'mission-done',
] as const;

export type ValidationResult = { ok: true; feed: StatusFeed } | { ok: false; error: string };

class Invalid extends Error {}

type Obj = Record<string, unknown>;

function fail(path: string, why: string): never {
  throw new Invalid(`${path}: ${why}`);
}

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Checks `v` is a plain object with only `allowed` keys and all `required` keys. */
function obj(
  v: unknown,
  path: string,
  allowed: readonly string[],
  required: readonly string[],
): Obj {
  if (!isObj(v)) fail(path, 'expected an object');
  for (const k of Object.keys(v)) if (!allowed.includes(k)) fail(path, 'unexpected field');
  for (const k of required)
    if (!Object.prototype.hasOwnProperty.call(v, k)) fail(path, 'missing field');
  return v;
}

function oneOf<T extends string>(v: unknown, path: string, values: readonly T[]): T {
  if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) {
    fail(path, 'value not allowed');
  }
  return v as T;
}

function time(v: unknown, path: string): string {
  if (typeof v !== 'string' || !TIME_RE.test(v) || Number.isNaN(Date.parse(v))) {
    fail(path, 'expected an ISO-8601 UTC timestamp');
  }
  // Date rolls 2026-02-31 over to March; a real timestamp survives the round trip.
  if (new Date(v).toISOString().slice(0, 19) !== v.slice(0, 19)) {
    fail(path, 'expected an ISO-8601 UTC timestamp');
  }
  return v;
}

function verb(v: unknown, path: string): string {
  if (typeof v !== 'string' || !VERB_RE.test(v) || !VERBS.includes(v)) {
    fail(path, 'verb not allowlisted');
  }
  return v;
}

function mission(v: unknown, path: string): string {
  if (typeof v !== 'string' || !MISSION_RE.test(v)) fail(path, 'bad mission codename');
  return v;
}

function int(v: unknown, path: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    fail(path, `expected an integer in ${min}..${max}`);
  }
  return v;
}

function count(v: unknown, path: string): Count {
  const o = obj(v, path, ['done', 'total'], ['done', 'total']);
  const done = int(o.done, `${path}.done`, 0, 999);
  const total = int(o.total, `${path}.total`, 1, 999);
  // Stricter than the JSON Schema, matching bin/hideout in the feed repo.
  if (done > total) fail(path, 'done is greater than total');
  return { done, total };
}

function list(v: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(v)) fail(path, 'expected an array');
  if (v.length > max) fail(path, `more than ${max} items`);
  return v;
}

function isMemberId(v: unknown): v is MemberId {
  return typeof v === 'string' && (MEMBER_IDS as readonly string[]).includes(v);
}

function parseMission(v: unknown, path: string): Mission {
  const o = obj(
    v,
    path,
    ['codename', 'state', 'startedAt', 'endedAt', 'tickets'],
    ['codename', 'state', 'startedAt'],
  );
  const m: Mission = {
    codename: mission(o.codename, `${path}.codename`),
    state: oneOf(o.state, `${path}.state`, MISSION_STATES),
    startedAt: time(o.startedAt, `${path}.startedAt`),
  };
  if (o.endedAt !== undefined) m.endedAt = time(o.endedAt, `${path}.endedAt`);
  if (o.tickets !== undefined) m.tickets = count(o.tickets, `${path}.tickets`);
  return m;
}

function parseMember(v: unknown, path: string): MemberStatus {
  const o = obj(
    v,
    path,
    ['state', 'since', 'updatedAt', 'verb', 'mission', 'progress'],
    ['state', 'since'],
  );
  const m: MemberStatus = {
    state: oneOf(o.state, `${path}.state`, MEMBER_STATES),
    since: time(o.since, `${path}.since`),
  };
  if (o.updatedAt !== undefined) m.updatedAt = time(o.updatedAt, `${path}.updatedAt`);
  if (o.verb !== undefined) m.verb = verb(o.verb, `${path}.verb`);
  if (o.mission !== undefined) m.mission = mission(o.mission, `${path}.mission`);
  if (o.progress !== undefined) m.progress = count(o.progress, `${path}.progress`);
  return m;
}

/** Returns null for an otherwise valid event from an unknown member (ignored). */
function parseEvent(v: unknown, path: string): FeedEvent | null {
  const o = obj(v, path, ['at', 'who', 'kind', 'verb', 'mission'], ['at', 'who', 'kind']);
  const at = time(o.at, `${path}.at`);
  const kind = oneOf(o.kind, `${path}.kind`, EVENT_KINDS);
  const verbV = o.verb === undefined ? undefined : verb(o.verb, `${path}.verb`);
  const missionV = o.mission === undefined ? undefined : mission(o.mission, `${path}.mission`);
  if (!isMemberId(o.who)) {
    if (typeof o.who !== 'string') fail(`${path}.who`, 'expected a member id');
    return null;
  }
  const e: FeedEvent = { at, who: o.who, kind };
  if (verbV !== undefined) e.verb = verbV;
  if (missionV !== undefined) e.mission = missionV;
  return e;
}

function parse(input: unknown): StatusFeed {
  const o = obj(
    input,
    '$',
    ['version', 'updatedAt', 'missions', 'members', 'events'],
    ['version', 'updatedAt', 'missions', 'members', 'events'],
  );
  if (o.version !== 1) fail('$.version', 'expected 1');
  const updatedAt = time(o.updatedAt, '$.updatedAt');
  const missions = list(o.missions, '$.missions', MAX_MISSIONS).map((m, i) =>
    parseMission(m, `$.missions[${i}]`),
  );

  if (!isObj(o.members)) fail('$.members', 'expected an object');
  const members: Partial<Record<MemberId, MemberStatus>> = {};
  for (const [id, value] of Object.entries(o.members)) {
    // Unknown ids are ignored, but known ids must be fully valid.
    if (isMemberId(id)) members[id] = parseMember(value, `$.members.${id}`);
  }

  const events: FeedEvent[] = [];
  list(o.events, '$.events', MAX_EVENTS).forEach((e, i) => {
    const parsed = parseEvent(e, `$.events[${i}]`);
    if (parsed) events.push(parsed);
  });

  return { version: 1, updatedAt, missions, members, events };
}

/** Validates an untrusted value (already JSON-parsed) against the v1 feed rules. */
export function validateFeed(input: unknown): ValidationResult {
  try {
    return { ok: true, feed: parse(input) };
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, error: err.message };
    throw err;
  }
}
