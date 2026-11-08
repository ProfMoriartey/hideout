// Shizuku: medium and slim, black bob, dark clothes. Cleans the archive with
// an upright vacuum; working sweeps it back and forth over the floor.

import { MEMBER_BY_ID } from '../../config/members';
import type { RoomAnchors } from '../voxel/hideout';
import { box, headTop, humanoid, inRoom, markAbove, type Human, type MemberArt } from './figure';

const C = MEMBER_BY_ID.shizuku.colors;

export function shizuku(a: RoomAnchors): MemberArt {
  const at = inRoom(a, [10.3, 0, 7]);
  const h: Human = {
    legs: 5,
    torso: 5,
    width: 3.5,
    hair: 'bob',
    hairColor: 0x111116,
    top: C.primary,
    bottom: 0x2c2c42,
    head: { axis: [1, 0, 0], offset: 0.3 },
    extras: [box([-1.9, 9.25, -1.35], [3.8, 0.75, 2.7], C.secondary)],
    left: { motion: { axis: [1, 0, 0], offset: -0.45 } },
    right: {
      motion: { axis: [1, 0, 0], offset: -0.5, amp: 0.3, speed: 3 },
      holds: [
        box([-0.2, -1, 0.4], [0.4, 1.5, 0.4], 0x50545c),
        box([-0.9, -2.8, 0.1], [1.8, 2.2, 1.6], 0x3a5a8a),
        box([-0.2, -4, 1], [0.4, 1.6, 0.4], 0x50545c),
        box([-1.4, -4.6, 0.6], [2.8, 0.9, 2.8], C.accent),
      ],
    },
  };
  return {
    placed: [{ at, yaw: -1.1, parts: humanoid(h) }, markAbove(at, headTop(h) + 1.5)],
    sparks: inRoom(a, [9.3, 0.4, 7.4]),
    sparkColor: C.accent,
  };
}
