// Which room's panel is open. Shared by the canvas labels (tap picking) and the
// DOM panel; a tiny external store so neither imports the other.
import { useSyncExternalStore } from 'react';
import type { MemberId } from '../config/members';

let selected: MemberId | null = null;
const subs = new Set<() => void>();

export function selectRoom(id: MemberId | null): void {
  if (id === selected) return;
  selected = id;
  subs.forEach((f) => f());
}

const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => void subs.delete(cb);
};

export function useSelectedRoom(): MemberId | null {
  return useSyncExternalStore(subscribe, () => selected);
}

/** A press shorter than this and moving less than TAP_SLOP px is a tap, not a pan. */
export const TAP_MAX_MS = 500;
export const TAP_SLOP = 8;

export function isTap(dx: number, dy: number, ms: number): boolean {
  return ms <= TAP_MAX_MS && Math.hypot(dx, dy) <= TAP_SLOP;
}
