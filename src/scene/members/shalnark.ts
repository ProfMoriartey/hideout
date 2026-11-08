// Shalnark: medium build, spiky blond hair, green top. Draws on the blueprint
// at the drafting table; the antenna on the table blinks and turns while working.

import { MEMBER_BY_ID } from '../../config/members';
import type { RoomAnchors } from '../voxel/hideout';
import { box, headTop, humanoid, inRoom, markAbove, type Human, type MemberArt } from './figure';

const C = MEMBER_BY_ID.shalnark.colors;

export function shalnark(a: RoomAnchors): MemberArt {
  const at = inRoom(a, [10.3, 0, 5]);
  const h: Human = {
    legs: 5.5,
    torso: 5,
    width: 4,
    hair: 'spiky',
    hairColor: C.secondary,
    top: C.primary,
    bottom: 0x2b2b33,
    head: { axis: [1, 0, 0], offset: 0.35 },
    left: { motion: { axis: [1, 0, 0], offset: -0.5 } },
    right: {
      motion: { axis: [1, 0, 0], offset: -1.2, amp: 0.22, speed: 5 },
      holds: [box([-0.15, -0.3, 0.3], [0.3, 0.3, 1.6], 0xe8e8e8)],
    },
  };
  return {
    placed: [
      { at, yaw: -Math.PI / 2, parts: humanoid(h) },
      // Blueprint on the table top (y = 3): sheet plus glowing lines.
      {
        at: inRoom(a, [5, 3, 4]),
        parts: [
          { boxes: [box([0.5, 0, 0.5], [14, 0.3, 6], 0x24508a)] },
          {
            glow: 1,
            boxes: [
              box([2, 0.3, 2], [8, 0.1, 0.4], C.accent),
              box([2, 0.3, 4], [5, 0.1, 0.4], C.accent),
              box([10, 0.3, 1.5], [0.4, 0.1, 4], C.accent),
            ],
          },
        ],
      },
      // Antenna on the table's back corner: mast, turning dish, blinking tip.
      {
        at: inRoom(a, [5.4, 4, 3.4]),
        parts: [
          { boxes: [box([-0.25, 0, -0.25], [0.5, 8, 0.5], 0x50545c)] },
          {
            pivot: [0, 6, 0],
            motion: { axis: [0, 1, 0], amp: 0.9, speed: 1.3 },
            boxes: [
              box([-1.5, 5.5, 0.25], [3, 2, 0.4], 0xb8bcc4),
              box([-0.2, 6.3, 0.6], [0.4, 0.4, 1], 0x50545c),
            ],
          },
          { glow: 1, boxes: [box([-0.5, 8, -0.5], [1, 1, 1], C.accent)] },
        ],
      },
      markAbove(at, headTop(h) + 1.5),
    ],
    sparks: inRoom(a, [5.4, 6.3, 3.4]),
    sparkColor: C.accent,
  };
}
