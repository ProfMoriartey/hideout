// `?demo=1` fake feed. A pure function of (step, seed, origin), so e2e runs can
// rely on exactly what is shown at a given step.
import type { FeedSnapshot, FeedSource, Clock } from './source';
import { systemClock } from './source';
import type { FeedEvent, MemberId, MemberStatus, Mission, StatusFeed } from './types';
import { MAX_EVENTS, MEMBER_IDS, VERBS } from './validate';

export const DEMO_STEP_MS = 4000;
/** Steps in one member cycle: idle, idle, working x4, done, idle, stale, idle. */
export const DEMO_CYCLE = 10;
const WORK_START = 2;
const WORK_END = 5;
const DONE_PHASE = 6;
const STALE_PHASE = 8;
const STALE_AGE_MS = 4 * 60 * 60 * 1000;
const MISSION_PERIOD = 33;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Small deterministic integer hash (mulberry32 finaliser) mapped to [0, 1). */
function rand(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) h = Math.imul(h ^ (p | 0), 0x85ebca6b) ^ (h >>> 13);
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

/**
 * Phase offset per member: every phase is covered at least once (so at least
 * four members are working at any step), shuffled by the seed.
 */
function offsets(seed: number): number[] {
  const out = MEMBER_IDS.map((_, i) => i % DEMO_CYCLE);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand(seed, 7, i) * (i + 1));
    const tmp = out[i] ?? 0;
    out[i] = out[j] ?? 0;
    out[j] = tmp;
  }
  return out;
}

export function demoStep(now: number, origin: number): number {
  return Math.floor((now - origin) / DEMO_STEP_MS);
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

type Phase = { phase: number; cycle: number };

function phaseAt(step: number, offset: number): Phase {
  const p = step + offset;
  return { phase: mod(p, DEMO_CYCLE), cycle: Math.floor(p / DEMO_CYCLE) };
}

function verbFor(seed: number, member: number, cycle: number): string {
  return VERBS[Math.floor(rand(seed, member, cycle) * VERBS.length)] ?? 'building';
}

const missionFor = (i: number) => (i % 2 === 0 ? 'Silk Lantern' : 'Night Market');

function memberAt(
  step: number,
  i: number,
  off: number,
  seed: number,
  origin: number,
): MemberStatus {
  const at = (s: number) => origin + s * DEMO_STEP_MS;
  const { phase, cycle } = phaseAt(step, off);
  const phaseStart = (p: number) => at(step - phase + p);
  const verb = verbFor(seed, i, cycle);
  if (phase >= WORK_START && phase <= WORK_END) {
    return {
      state: 'working',
      since: iso(phaseStart(WORK_START)),
      verb,
      mission: missionFor(i),
      progress: { done: phase - WORK_START + 1, total: WORK_END - WORK_START + 2 },
    };
  }
  if (phase === DONE_PHASE) {
    return { state: 'done', since: iso(phaseStart(DONE_PHASE)), verb, mission: missionFor(i) };
  }
  if (phase === STALE_PHASE) {
    return { state: 'working', since: iso(at(step) - STALE_AGE_MS), verb };
  }
  const idleStart = phase < WORK_START ? -1 : phase === DONE_PHASE + 1 ? DONE_PHASE + 1 : phase;
  return { state: 'idle', since: iso(phaseStart(idleStart)) };
}

function silkLantern(step: number, origin: number): Mission {
  const m = mod(step, MISSION_PERIOD);
  const done = Math.min(Math.floor(m / 3), 10);
  const start = origin + (step - m) * DEMO_STEP_MS;
  const mission: Mission = {
    codename: 'Silk Lantern',
    state: done === 10 ? 'done' : 'active',
    startedAt: iso(start),
    tickets: { done, total: 10 },
  };
  if (done === 10) mission.endedAt = iso(start + 30 * DEMO_STEP_MS);
  return mission;
}

function nightMarket(step: number, origin: number): Mission {
  return {
    codename: 'Night Market',
    state: 'active',
    startedAt: iso(origin - 2 * 60 * 60 * 1000),
    tickets: { done: mod(Math.floor(step / 4), 8), total: 7 },
  };
}

function eventsAt(step: number, offs: number[], seed: number, origin: number): FeedEvent[] {
  const events: FeedEvent[] = [];
  for (let k = step; k > step - 4 * DEMO_CYCLE && events.length < MAX_EVENTS; k--) {
    const at = iso(origin + k * DEMO_STEP_MS);
    if (mod(k, 3) === 0 && mod(k, MISSION_PERIOD) !== 0) {
      const done = mod(k, MISSION_PERIOD) === 30;
      events.push({
        at,
        who: 'shalnark',
        kind: done ? 'mission-done' : 'mission-progress',
        mission: 'Silk Lantern',
      });
    } else if (mod(k, MISSION_PERIOD) === 0) {
      events.push({ at, who: 'shalnark', kind: 'mission-start', mission: 'Silk Lantern' });
    }
    MEMBER_IDS.forEach((who, i) => {
      const { phase, cycle } = phaseAt(k, offs[i] ?? 0);
      const kind =
        phase === WORK_START
          ? 'start'
          : phase === WORK_START + 2
            ? 'progress'
            : phase === DONE_PHASE
              ? 'done'
              : null;
      if (kind) events.push({ at, who, kind, verb: verbFor(seed, i, cycle) });
    });
  }
  return events.slice(0, MAX_EVENTS);
}

export function demoFeedAt(step: number, seed: number, origin: number): StatusFeed {
  const offs = offsets(seed);
  const members: Partial<Record<MemberId, MemberStatus>> = {};
  MEMBER_IDS.forEach((id, i) => {
    members[id] = memberAt(step, i, offs[i] ?? 0, seed, origin);
  });
  return {
    version: 1,
    updatedAt: iso(origin + step * DEMO_STEP_MS),
    missions: [silkLantern(step, origin), nightMarket(step, origin)],
    members,
    events: eventsAt(step, offs, seed, origin),
  };
}

export type DemoOptions = {
  seed: number;
  clock?: Clock;
  /** Start of step 0; defaults to the clock's time at start(). */
  origin?: number;
  onChange(snapshot: FeedSnapshot): void;
};

export function createDemoSource(options: DemoOptions): FeedSource {
  const clock = options.clock ?? systemClock;
  let origin = 0;
  let timer: unknown = null;
  let running = false;

  function emit() {
    if (!running) return;
    const now = clock.now();
    const step = demoStep(now, origin);
    options.onChange({
      feed: demoFeedAt(step, options.seed, origin),
      lastUpdated: now,
      status: 'live',
      source: 'demo',
    });
    const next = origin + (step + 1) * DEMO_STEP_MS;
    timer = clock.setTimeout(emit, Math.max(0, next - now));
  }

  return {
    start() {
      if (running) return;
      running = true;
      origin = options.origin ?? clock.now();
      emit();
    },
    stop() {
      running = false;
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
    },
  };
}
