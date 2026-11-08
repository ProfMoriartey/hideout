// Feitan: short and slim, messy dark hair, dark clothes with a high collar,
// a closed umbrella. Faces the test targets; working jabs at them.

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
  type Placed,
} from './figure';

const C = MEMBER_BY_ID.feitan.colors;

function target(at: readonly [number, number, number], phase: number): Placed {
  return {
    at,
    yaw: -Math.PI / 2,
    parts: [
      {
        boxes: [
          box([-0.3, 0, -0.3], [0.6, 6, 0.6], 0x3a3c44),
          box([-1.5, 0, -1.5], [3, 0.5, 3], 0x2a2a34),
        ],
      },
      {
        pivot: [0, 6, 0],
        motion: { axis: [1, 0, 0], amp: 0.14, speed: 6, phase },
        boxes: [
          box([-2.75, 6, -0.25], [5.5, 5.5, 0.5], 0xe8e0d0),
          box([-1.9, 6.85, 0.2], [3.8, 3.8, 0.2], C.accent),
          box([-1.1, 7.65, 0.35], [2.2, 2.2, 0.2], 0xe8e0d0),
          // Same rings on the back, which is the side the camera sees.
          box([-1.9, 6.85, -0.4], [3.8, 3.8, 0.2], C.accent),
          box([-1.1, 7.65, -0.55], [2.2, 2.2, 0.2], 0xe8e0d0),
        ],
      },
      {
        glow: 1,
        pivot: [0, 6, 0],
        motion: { axis: [1, 0, 0], amp: 0.14, speed: 6, phase },
        boxes: [
          box([-0.5, 8.25, 0.5], [1, 1, 0.2], C.accent),
          box([-0.5, 8.25, -0.7], [1, 1, 0.2], C.accent),
        ],
      },
    ],
  };
}

export function feitan(a: RoomAnchors): MemberArt {
  const at = inRoom(a, [5, 0, 6.2]);
  const h: Human = {
    legs: 4,
    torso: 4.5,
    width: 3.5,
    hair: 'shaggy',
    hairColor: 0x15151c,
    top: C.primary,
    bottom: C.primary,
    head: { axis: [1, 0, 0], offset: 0.1 },
    extras: [box([-2.25, 8.25, -2.3], [4.5, 2, 4.6], C.secondary)],
    left: { motion: { axis: [1, 0, 0], offset: 0.2 } },
    right: {
      motion: { axis: [1, 0, 0], offset: -1.45, amp: 0.3, speed: 9 },
      holds: [
        box([-0.25, 0.25, -1], [0.5, 0.5, 7], 0x2a2a34),
        box([-0.4, 0, -1.5], [0.8, 1, 0.8], 0x4a2a2a),
      ],
    },
  };
  return {
    placed: [
      { at, yaw: Math.PI / 2, parts: humanoid(h) },
      target(inRoom(a, [11.5, 0, 4.6]), 0),
      target(inRoom(a, [11.5, 0, 7.6]), 1.7),
      markAbove(at, headTop(h) + 1.5),
    ],
    sparks: inRoom(a, [11.3, 2, 6]),
    sparkColor: C.accent,
  };
}
