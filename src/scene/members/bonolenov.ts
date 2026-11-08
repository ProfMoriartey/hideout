// Bonolenov: tall and very broad, wrapped head to toe in beige bandages,
// brown trousers. Plays the drums on the platform; working: both arms drum.

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
  type Part,
} from './figure';

const C = MEMBER_BY_ID.bonolenov.colors;
const BAND = 0x9a8462;

function drum(x: number, z: number, w: number, h: number): Part {
  return {
    boxes: [
      box([x - w / 2, 0, z - w / 2], [w, h, w], C.secondary),
      box([x - w / 2 + 0.3, h, z - w / 2 + 0.3], [w - 0.6, 0.3, w - 0.6], 0xece0c8),
    ],
  };
}

export function bonolenov(a: RoomAnchors): MemberArt {
  const at = inRoom(a, [4, 1, 4]);
  const stick = [box([-0.15, 0.2, 0], [0.3, 0.3, 3], 0xc8a878)];
  const drumming = (phase: number) => ({
    axis: [1, 0, 0] as const,
    offset: -0.95,
    amp: 0.4,
    speed: 10,
    phase,
  });
  const h: Human = {
    legs: 6,
    torso: 6.5,
    width: 6,
    hair: 'wrap',
    hairColor: BAND,
    skin: C.primary,
    top: C.primary,
    bottom: C.secondary,
    head: { axis: [1, 0, 0], offset: 0, amp: 0.1, speed: 5 },
    extras: [
      box([-3.05, 7.5, -1.3], [6.1, 0.4, 2.6], BAND),
      box([-3.05, 9.5, -1.3], [6.1, 0.4, 2.6], BAND),
      box([-3.05, 11.2, -1.3], [6.1, 0.4, 2.6], BAND),
    ],
    left: { motion: drumming(0), holds: stick },
    right: { motion: drumming(Math.PI), holds: stick },
  };
  return {
    placed: [
      { at, parts: humanoid(h) },
      {
        at: inRoom(a, [4, 1, 6]),
        parts: [drum(0, 0, 5, 4), drum(-5.5, -0.5, 4, 4.5), drum(5.5, -0.5, 4, 4.5)],
      },
      markAbove(at, headTop(h) + 1.5),
    ],
    sparks: inRoom(a, [4, 2.3, 6]),
    sparkColor: C.accent,
  };
}
