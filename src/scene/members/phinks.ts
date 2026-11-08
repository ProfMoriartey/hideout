// Phinks: tall and broad, short swept blond hair, blue tracksuit. Stands at
// the anvil beside the forge; working swings the hammer and throws sparks.

import { MEMBER_BY_ID } from '../../config/members';
import type { RoomAnchors } from '../voxel/hideout';
import { box, headTop, humanoid, inRoom, markAbove, type Human, type MemberArt } from './figure';

const C = MEMBER_BY_ID.phinks.colors;

export function phinks(a: RoomAnchors): MemberArt {
  const at = inRoom(a, [10.6, 0, 4.5]);
  const h: Human = {
    legs: 6.5,
    torso: 6,
    width: 5,
    hair: 'short',
    hairColor: C.secondary,
    top: C.primary,
    bottom: C.primary,
    head: { axis: [1, 0, 0], offset: 0.2 },
    extras: [box([-2.6, 11, -1.3], [5.2, 0.5, 2.6], 0x26336a)],
    left: { motion: { axis: [1, 0, 0], offset: -0.4 } },
    right: {
      motion: { axis: [1, 0, 0], offset: -0.95, amp: 0.75, speed: 7 },
      holds: [
        box([-0.25, 0.25, 0], [0.5, 0.5, 4], 0x6a4a2a),
        box([-0.9, -0.4, 3.6], [1.8, 1.8, 1.6], 0x5a5e66),
      ],
    },
  };
  return {
    placed: [{ at, yaw: -Math.PI / 2, parts: humanoid(h) }, markAbove(at, headTop(h) + 1.5)],
    sparks: inRoom(a, [9.3, 2.2, 4.5]),
    sparkColor: C.accent,
  };
}
