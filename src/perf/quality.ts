// Quality tiers and the fps monitor that steps them down. Pure, so the
// switching rules are unit-tested; PerfMonitor feeds it one frame at a time.

export type Tier = 'low' | 'medium' | 'high';

/** Highest device pixel ratio each tier renders at (never above the screen's own). */
export const DPR_MAX: Record<Tier, number> = { low: 1, medium: 1.5, high: 2 };
/** Low tier renders at most this often (the animation stays the same speed). */
export const LOW_FPS = 30;
/** A window averaging below this drops one tier. */
export const DROP_FPS = 45;
export const WINDOW_SECONDS = 3;
/** A frame gap this long (hidden tab, frozen page) restarts the window instead of counting. */
const GAP_SECONDS = 1;

/** Touch-first devices (phones, tablets) start at medium, the rest at high. */
export function startTier(coarsePointer: boolean): Tier {
  return coarsePointer ? 'medium' : 'high';
}

export function deviceTier(): Tier {
  return startTier(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
}

export type Monitor = { tier: Tier; time: number; frames: number };

export function createMonitor(tier: Tier): Monitor {
  return { tier, time: 0, frames: 0 };
}

/**
 * Counts one frame of `dt` seconds. Returns true when the tier dropped.
 * Tiers only go down: a scene that once averaged under DROP_FPS is not
 * trusted to hold 60 again, so there is no bounce-back loop.
 */
export function stepMonitor(m: Monitor, dt: number): boolean {
  if (m.tier === 'low') return false;
  if (dt > GAP_SECONDS) {
    m.time = 0;
    m.frames = 0;
    return false;
  }
  m.time += dt;
  m.frames++;
  if (m.time < WINDOW_SECONDS) return false;
  const slow = m.frames / m.time < DROP_FPS;
  m.time = 0;
  m.frames = 0;
  if (!slow) return false;
  m.tier = m.tier === 'high' ? 'medium' : 'low';
  return true;
}
