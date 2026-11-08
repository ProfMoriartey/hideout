// Franklin: very tall and very broad, cropped dark hair, long olive coat.
// Works the pipes at the bench with a big wrench; steam rises while working.

import { MEMBER_BY_ID } from '../../config/members';
import type { RoomAnchors } from '../voxel/hideout';
import { box, headTop, humanoid, inRoom, markAbove, type Human, type MemberArt } from './figure';

const C = MEMBER_BY_ID.franklin.colors;
const COPPER = 0x9a5a32;

export function franklin(a: RoomAnchors): MemberArt {
  const at = inRoom(a, [6.2, 0, 6]);
  const h: Human = {
    legs: 7,
    torso: 7.5,
    width: 6,
    hair: 'buzz',
    hairColor: 0x221c18,
    top: C.primary,
    bottom: 0x34362c,
    head: { axis: [1, 0, 0], offset: 0.2 },
    extras: [
      box([-3.25, 2.5, -1.5], [6.5, 4.6, 3], C.primary),
      box([-3.25, 13.5, -1.5], [6.5, 1, 3], C.secondary),
    ],
    left: { motion: { axis: [1, 0, 0], offset: -0.6 } },
    right: {
      motion: { axis: [1, 0, 0], offset: -1.0, amp: 0.45, speed: 3.5 },
      holds: [
        box([-0.25, 0.25, 0], [0.5, 0.5, 4.5], 0x9aa0a8),
        box([-0.9, -0.2, 4], [1.8, 1.2, 1.2], 0x9aa0a8),
      ],
    },
  };
  return {
    placed: [
      { at, yaw: -Math.PI / 2, parts: humanoid(h) },
      // Pipe work on the bench: a T of copper pipes and a red valve wheel.
      {
        at: inRoom(a, [2.5, 1, 6]),
        parts: [
          {
            boxes: [
              box([-5, 0, -0.75], [10, 1.5, 1.5], COPPER),
              box([-0.75, 0, -3], [1.5, 6, 1.5], COPPER),
            ],
          },
          {
            pivot: [0, 4, 0],
            motion: { axis: [0, 1, 0], amp: 1.2, speed: 1.75 },
            boxes: [box([-1.5, 4, -1.5], [3, 0.5, 3], 0xa02a2a)],
          },
        ],
      },
      markAbove(at, headTop(h) + 1.5),
    ],
    sparks: inRoom(a, [2.5, 2.5, 5.5]),
    sparkColor: C.accent,
  };
}
