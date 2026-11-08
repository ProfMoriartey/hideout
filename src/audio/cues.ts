// Written by Chrollo
import type { FeedEvent } from '../feed/types';

export type Cue = 'start' | 'done';

/** Minimum gap between two cues, so a burst of events is one chime, not noise. */
export const CUE_GAP_MS = 1500;

const keyOf = (e: FeedEvent) => `${e.at}|${e.who}|${e.kind}`;

/**
 * Picks the cue for the events that appeared since `seen` and replaces `seen`
 * with the keys now present (so it never grows). Pass `first` for a feed that
 * was already there when sound was enabled: it is only marked as seen.
 */
export function pickCue(
  seen: Set<string>,
  events: readonly FeedEvent[],
  first: boolean,
): Cue | null {
  let cue: Cue | null = null;
  for (const e of events) {
    if (seen.has(keyOf(e))) continue;
    if (e.kind === 'done') cue = 'done';
    else if (e.kind === 'start' && cue === null) cue = 'start';
  }
  seen.clear();
  for (const e of events) seen.add(keyOf(e));
  return first ? null : cue;
}

/** Rate limit: a `done` always plays (it is the news); `start` waits out the gap. */
export function shouldChime(cue: Cue, lastAt: number, now: number): boolean {
  return cue === 'done' || now - lastAt >= CUE_GAP_MS;
}
