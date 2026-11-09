// Kalluto: small and slim, black bob with a fringe, dark kimono with a light
// sash, a folding fan. Stands behind the paper table; working waves the fan
// and paper sheets lift and drift.

import { MEMBER_BY_ID } from '../../config/members';
import type { RoomAnchors } from '../voxel/hideout';
import {
  box,
  headTop,
  humanoid,
  inRoom,
  markAbove,
  type Human,
  type MemberArt,
  type Part,
} from './figure';

const C = MEMBER_BY_ID.kalluto.colors;

function sheet(x: number, z: number, phase: number, color: number): Part {
  return {
    pivot: [x, 0, z],
    motion: { axis: [0, 1, 0], slide: true, rest: 0, offset: 5, amp: 2.5, speed: 1.3, phase },
    boxes: [box([x - 1.25, 0.1, z - 1.25], [2.5, 0.25, 2.5], color)],
  };
}

export function kalluto(a: RoomAnchors): MemberArt {
  const at = inRoom(a, [7, 0, 1.8]);
  const h: Human = {
    legs: 4,
    torso: 4.5,
    width: 3.5,
    hair: 'bob',
    hairColor: 0x111114,
    top: C.primary,
    bottom: C.primary,
    head: { axis: [1, 0, 0], offset: 0.15 },
    extras: [
      box([-2, 0.5, -1.4], [4, 3.6, 2.8], C.primary),
      box([-1.85, 5, -1.35], [3.7, 1, 2.7], C.secondary),
    ],
    left: { motion: { axis: [1, 0, 0], offset: -0.3 } },
    right: {
      motion: { axis: [1, 0, 0], offset: -1.1, amp: 0.55, speed: 5 },
      holds: [
        box([-1.75, -0.1, 0.4], [3.5, 0.3, 2.2], C.secondary),
        box([-1.75, -0.05, 2.4], [3.5, 0.3, 0.4], C.accent),
      ],
    },
  };
  return {
    placed: [
      { at, parts: humanoid(h) },
      {
        at: inRoom(a, [7, 1, 4.5]),
        parts: [
          sheet(-6, -1.5, 0, C.secondary),
          sheet(-2, 2, 1.3, 0xffffff),
          sheet(2.5, -2, 2.6, C.accent),
          sheet(6, 1.5, 3.9, C.secondary),
          sheet(0, 0, 5.1, 0xffffff),
        ],
      },
      markAbove(at, headTop(h) + 2),
    ],
    sparks: inRoom(a, [7, 1.5, 4.5]),
    sparkColor: C.accent,
  };
}
