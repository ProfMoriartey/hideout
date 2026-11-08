// Chrollo: slim, slicked-back black hair, dark long coat with a light collar.
// Sits on the throne with the big book open in his lap; working turns pages.

import { MEMBER_BY_ID } from '../../config/members';
import type { RoomAnchors } from '../voxel/hideout';
import { box, headTop, humanoid, markAbove, type Human, type MemberArt } from './figure';

const C = MEMBER_BY_ID.chrollo.colors;
const PAPER = 0xf0e6c8;

export function chrollo(a: RoomAnchors): MemberArt {
  const at = [a.figure[0], a.figure[1], a.figure[2] + 0.5] as const;
  const h: Human = {
    legs: 6,
    torso: 6,
    width: 4.5,
    sit: true,
    hair: 'slick',
    hairColor: 0x131118,
    top: C.primary,
    bottom: 0x1d1826,
    head: { axis: [1, 0, 0], offset: 0.28 },
    extras: [
      box([-2.75, 5.75, -1.5], [5.5, 1.25, 3], C.secondary),
      box([-2.5, 1.5, -1.4], [5, 0.5, 3.4], C.primary),
    ],
    left: { motion: { axis: [1, 0, 0], rest: -0.55, offset: -0.75 } },
    right: { motion: { axis: [1, 0, 0], rest: -0.55, offset: -0.75, amp: 0.08, speed: 1.2 } },
  };
  // The big book in the lap: covers, open pages, and one page that turns.
  const book = [
    box([-3, 2, 1.25], [6, 0.5, 3.5], 0x5a1e24),
    box([-2.8, 2.5, 1.4], [2.7, 0.35, 3.2], PAPER),
    box([0.1, 2.5, 1.4], [2.7, 0.35, 3.2], PAPER),
    box([-0.15, 2.5, 1.25], [0.3, 0.45, 3.5], C.accent),
  ];
  return {
    placed: [
      {
        at,
        parts: [
          ...humanoid(h),
          { boxes: book },
          {
            glow: 1,
            pivot: [0, 2.85, 0],
            motion: { axis: [0, 0, 1], offset: 1.55, amp: 1.45, speed: 1.1 },
            boxes: [box([0.1, 2.85, 1.5], [2.6, 0.2, 3], 0xffe9b0)],
          },
        ],
      },
      markAbove(at, headTop(h) + 1.5),
    ],
    sparks: [at[0], at[1] + 1, at[2] + 0.8],
    sparkColor: C.accent,
  };
}
