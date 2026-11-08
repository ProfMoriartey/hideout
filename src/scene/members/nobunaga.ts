// Nobunaga: tall, dark topknot, light top over dark wide trousers, a sheathed
// sword at the hip. Keeps watch by the lantern post; working: the lantern
// burns and sways, he scans the room, hand on the hilt.

import { MEMBER_BY_ID } from '../../config/members';
import type { RoomAnchors } from '../voxel/hideout';
import { box, headTop, humanoid, inRoom, markAbove, type Human, type MemberArt } from './figure';

const C = MEMBER_BY_ID.nobunaga.colors;

export function nobunaga(a: RoomAnchors): MemberArt {
  const at = inRoom(a, [7.5, 0, 6.3]);
  const h: Human = {
    legs: 6.5,
    torso: 5.5,
    width: 4.5,
    hair: 'topknot',
    hairColor: 0x17120e,
    top: C.secondary,
    bottom: C.primary,
    head: { axis: [1, 0, 0], offset: 0, amp: 0.12, speed: 0.9 },
    extras: [
      box([-2.5, 1.5, -1.25], [5, 5, 2.5], C.primary),
      box([-2.4, 6.5, -1.35], [4.8, 0.6, 2.7], 0x2a201a),
      box([2.4, 6, -3.2], [0.6, 0.7, 5.6], 0x1a1a1e),
      box([2.35, 6.1, 2.4], [0.7, 0.6, 1.6], 0x6a5a40),
    ],
    left: { motion: { axis: [1, 0, 0], offset: -0.1 } },
    right: { motion: { axis: [1, 0, 0], offset: -0.5, amp: 0.08, speed: 1.8 } },
  };
  return {
    placed: [
      { at, parts: humanoid(h) },
      // Hook arm on the post top and a swinging lantern under it.
      {
        at: inRoom(a, [4.5, 3, 3.5]),
        parts: [
          { boxes: [box([-0.3, 0, -0.3], [0.6, 0.5, 3.2], 0x2a2c34)] },
          {
            pivot: [0, 0, 2.6],
            motion: { axis: [1, 0, 0], amp: 0.22, speed: 1.6 },
            boxes: [
              box([-1.1, -3.8, 1.5], [2.2, 0.5, 2.2], 0x1a1a1e),
              box([-0.15, -1, 2.45], [0.3, 1, 0.3], 0x1a1a1e),
            ],
          },
          {
            glow: 1,
            pivot: [0, 0, 2.6],
            motion: { axis: [1, 0, 0], amp: 0.22, speed: 1.6 },
            boxes: [box([-0.9, -3.3, 1.7], [1.8, 2.3, 1.8], C.accent)],
          },
        ],
      },
      markAbove(at, headTop(h) + 2),
    ],
    sparks: inRoom(a, [4.5, 2.2, 4.1]),
    sparkColor: C.accent,
  };
}
