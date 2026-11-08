// Machi: medium and slim, pink hair in a high ponytail, blue outfit. Stands
// behind the sewing table; working pulls a needle and a glowing thread.

import { MEMBER_BY_ID } from '../../config/members';
import type { RoomAnchors } from '../voxel/hideout';
import { box, headTop, humanoid, inRoom, markAbove, type Human, type MemberArt } from './figure';

const C = MEMBER_BY_ID.machi.colors;

export function machi(a: RoomAnchors): MemberArt {
  const at = inRoom(a, [7, 0, 1.7]);
  const h: Human = {
    legs: 5,
    torso: 5,
    width: 3.5,
    hair: 'ponytail',
    hairColor: C.primary,
    top: C.secondary,
    bottom: 0x2b3550,
    head: { axis: [1, 0, 0], offset: 0.3 },
    left: { motion: { axis: [1, 0, 0], offset: -1.05 } },
    right: {
      motion: { axis: [1, 0, 0], offset: -1.2, amp: 0.35, speed: 5 },
      holds: [box([-0.15, -0.15, 0.5], [0.3, 0.3, 2.2], 0xdcdce4)],
      glows: [box([-0.1, -3, 2.5], [0.2, 3, 0.2], C.accent)],
    },
  };
  return {
    placed: [
      { at, parts: humanoid(h) },
      {
        at: inRoom(a, [7, 2, 4.5]),
        parts: [
          {
            boxes: [
              box([-5, 0, -2.5], [10, 0.3, 5], 0xe6c6d2),
              box([4, 0, -3.5], [1.2, 1.5, 1.2], C.secondary),
            ],
          },
          {
            glow: 1,
            boxes: [
              box([-4, 0.3, 0], [8, 0.15, 0.25], C.accent),
              box([-1, 0.3, -2], [0.25, 0.15, 4], C.accent),
            ],
          },
        ],
      },
      markAbove(at, headTop(h) + 2),
    ],
    sparks: inRoom(a, [7, 2.3, 4]),
    sparkColor: C.accent,
  };
}
