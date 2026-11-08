// Per-member animation levels shared by RoomLights (room tint) and Members
// (figure shader uniforms). RoomLights writes `display` from the feed and steps
// the levels once per frame; Members hands the same arrays to the GPU, so a
// state change costs no React render in the Canvas and no allocation.

import { MEMBERS } from '../../config/members';
import type { DisplayState } from '../../feed/derive';

export const MEMBER_COUNT = MEMBERS.length;

/** Room and figure brightness while idle or stale (1 = lit as baked). */
export const IDLE_LIGHT = 0.42;
/** Extra brightness at the peak of a done celebration. */
export const BURST_LIGHT = 0.9;
/** Celebration level held while `done` under reduced motion (no burst, a static glow). */
export const STATIC_GLOW = 0.5;
/** Seconds for the celebration burst to fall to ~5 %. */
export const CELEBRATE_SECONDS = 2.6;
/** How fast lights and poses follow a state change (1/s). */
const FOLLOW = 3.5;

export type Levels = {
  /** Display state per member, in MEMBERS order (written by RoomLights' watchers). */
  readonly display: DisplayState[];
  /** The display state seen by the previous step, to catch the start of `done`. */
  readonly seen: DisplayState[];
  /** 0 = idle pose, 1 = working at the station. */
  readonly work: Float32Array;
  /** Room and figure brightness. */
  readonly light: Float32Array;
  /** 1 at the start of a celebration, decays to 0. */
  readonly celebrate: Float32Array;
  /** 1 while stale (shows the "?"). */
  readonly stale: Float32Array;
};

export function createLevels(count: number = MEMBER_COUNT): Levels {
  return {
    display: Array.from({ length: count }, (): DisplayState => 'idle'),
    seen: Array.from({ length: count }, (): DisplayState => 'idle'),
    work: new Float32Array(count),
    light: new Float32Array(count).fill(IDLE_LIGHT),
    celebrate: new Float32Array(count),
    stale: new Float32Array(count),
  };
}

/** The page's levels (one scene per page). */
export const levels = createLevels();

/**
 * Advances every member by `dt` seconds. Reduced motion jumps straight to the
 * target (a light change, no fade) and holds a static glow while done.
 */
export function stepLevels(l: Levels, dt: number, reduced: boolean): void {
  const follow = reduced ? 1 : 1 - Math.exp(-dt * FOLLOW);
  const decay = Math.exp((-dt * 3) / CELEBRATE_SECONDS);
  for (let i = 0; i < l.work.length; i++) {
    const d = l.display[i] ?? 'idle';
    const work = l.work[i] ?? 0;
    const target = d === 'working' ? 1 : 0;
    l.work[i] = work + (target - work) * follow;
    let c = l.celebrate[i] ?? 0;
    if (reduced) c = d === 'done' ? STATIC_GLOW : 0;
    else if (d === 'done' && l.seen[i] !== 'done') c = 1;
    else c *= decay;
    l.celebrate[i] = c;
    l.stale[i] = d === 'stale' ? 1 : 0;
    l.light[i] = IDLE_LIGHT + (1 - IDLE_LIGHT) * (l.work[i] ?? 0) + BURST_LIGHT * c;
    l.seen[i] = d;
  }
}

const motionQuery =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** Live `prefers-reduced-motion` (one query object, read per frame without allocating). */
export function reducedMotion(): boolean {
  return motionQuery?.matches ?? false;
}
