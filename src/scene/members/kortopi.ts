// Kortopi: small, hidden under a long grey mop of hair, hands poking out.
// Screens float around the head; working: they rise, glow and bob, hands type.

import { MEMBER_BY_ID } from '../../config/members';
import type { RoomAnchors } from '../voxel/hideout';
import { box, markAbove, SKIN, type MemberArt, type Part } from './figure';

const C = MEMBER_BY_ID.kortopi.colors;
const X = [1, 0, 0] as const;

function screen(x: number, y: number, z: number, phase: number): Part {
  return {
    glow: 1,
    pivot: [x, y, z],
    motion: { axis: [0, 1, 0], slide: true, rest: -2.5, amp: 0.7, speed: 1.6, phase },
    boxes: [
      box([x - 1.9, y - 1.3, z - 0.3], [3.8, 2.6, 0.4], C.accent),
      box([x - 2.1, y - 1.5, z - 0.45], [4.2, 3, 0.2], 0x26262c),
    ],
  };
}

export function kortopi(a: RoomAnchors): MemberArt {
  const at = a.figure;
  const hand = (side: -1 | 1): Part => ({
    body: true,
    pivot: [side * 3, 3.5, 0],
    motion: { axis: X, rest: 0.1, offset: -0.7, amp: 0.3, speed: 11, phase: side },
    boxes: [box([side * 3 - 0.6, 2.5, 0], [1.2, 1, 1.4], SKIN)],
  });
  return {
    placed: [
      {
        at,
        parts: [
          {
            body: true,
            boxes: [
              box([-2.5, 0, -1], [2, 0.6, 2], 0x1c1a1e),
              box([0.5, 0, -1], [2, 0.6, 2], 0x1c1a1e),
              box([-3, 0.6, -2.75], [6, 5.4, 5.5], C.primary),
              // Hair ends flaring at the floor, and darker strands down the front.
              box([-3.4, 0.6, -2.9], [6.8, 1.4, 5.8], C.primary),
              box([-2.2, 0.6, 2.75], [0.5, 5.4, 0.3], C.secondary),
              box([-0.25, 0.6, 2.75], [0.5, 5.4, 0.3], C.secondary),
              box([1.7, 0.6, 2.75], [0.5, 5.4, 0.3], C.secondary),
            ],
          },
          {
            body: true,
            pivot: [0, 6, 0],
            motion: { axis: X, rest: 0.35, offset: 0, amp: 0.05, speed: 2.5 },
            boxes: [
              box([-3, 6, -2.75], [6, 3, 5.5], C.primary),
              box([-2.25, 9, -2], [4.5, 1, 4], C.primary),
              box([-1.25, 10, -1], [2.5, 0.75, 2], C.primary),
              box([-2.2, 6, 2.75], [0.5, 3, 0.3], C.secondary),
              box([1.7, 6, 2.75], [0.5, 3, 0.3], C.secondary),
              // Eyes glinting through the fringe.
              box([-1.3, 6.6, 2.75], [0.6, 0.5, 0.2], 0xe8f4ff),
              box([0.7, 6.6, 2.75], [0.6, 0.5, 0.2], 0xe8f4ff),
            ],
          },
          hand(-1),
          hand(1),
          screen(-6.5, 9, 1.5, 0),
          screen(0, 13, 0.5, 2.1),
          screen(6.5, 9, 1.5, 4.2),
        ],
      },
      markAbove(at, 16),
    ],
    sparks: [at[0], at[1] + 3, at[2] + 0.4],
    sparkColor: C.accent,
  };
}
