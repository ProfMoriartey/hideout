// Pakunoda: tall, light bob, dark suit. Stands at the end of the map table
// with a notebook in one hand; working writes in it.

import { MEMBER_BY_ID } from '../../config/members';
import type { RoomAnchors } from '../voxel/hideout';
import { box, headTop, humanoid, inRoom, markAbove, type Human, type MemberArt } from './figure';

const C = MEMBER_BY_ID.pakunoda.colors;

export function pakunoda(a: RoomAnchors): MemberArt {
  const at = inRoom(a, [10.5, 0, 5]);
  const h: Human = {
    legs: 6.5,
    torso: 5.5,
    width: 4,
    hair: 'bob',
    hairColor: C.secondary,
    top: C.primary,
    bottom: 0x232b44,
    head: { axis: [1, 0, 0], offset: 0.25, amp: 0.06, speed: 2 },
    extras: [box([-0.75, 9.5, 1.2], [1.5, 2.5, 0.15], 0xe8e2d4)],
    left: {
      motion: { axis: [1, 0, 0], offset: -1.15 },
      holds: [
        box([-0.25, -0.5, 0.2], [2.5, 0.5, 3], 0x7a2a3a),
        box([0, 0, 0.4], [2.2, 0.15, 2.6], 0xf4ecd8),
      ],
    },
    right: {
      motion: { axis: [1, 0, 0], offset: -1.0, amp: 0.14, speed: 8 },
      holds: [box([-0.15, -0.3, 0.3], [0.3, 0.3, 1.8], C.accent)],
    },
  };
  return {
    placed: [{ at, yaw: -Math.PI / 2, parts: humanoid(h) }, markAbove(at, headTop(h) + 1.5)],
    sparks: inRoom(a, [9.5, 2.5, 5]),
    sparkColor: C.accent,
  };
}
