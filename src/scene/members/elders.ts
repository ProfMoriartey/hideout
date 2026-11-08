// The Elders: a council of 11 hooded, seated figures around the round table
// (simple shapes, not 11 characters). Working: heads nod in turn, the orb
// over the table glows and bobs.

import { MEMBER_BY_ID } from '../../config/members';
import type { RoomAnchors } from '../voxel/hideout';
import { box, inRoom, markAbove, SKIN, type MemberArt, type Placed } from './figure';

const C = MEMBER_BY_ID.elders.colors;
const ROBES = [C.primary, 0x4a3a5e, 0x31263f] as const;

function elder(at: readonly [number, number, number], yaw: number, i: number): Placed {
  const robe = ROBES[i % ROBES.length] ?? C.primary;
  return {
    at,
    yaw,
    parts: [
      {
        body: true,
        boxes: [
          box([-1.75, 0, -1.25], [3.5, 5, 2.5], robe),
          box([-1.75, 0, -1.25], [3.5, 1.25, 4], robe),
          box([-1.75, -4, 1.5], [3.5, 4, 1.25], robe),
          box([-2, 4.25, -1.4], [4, 0.75, 2.8], C.secondary),
        ],
      },
      {
        body: true,
        pivot: [0, 5, 0],
        motion: { axis: [1, 0, 0], rest: 0.4, amp: 0.16, speed: 2.2, phase: i * 1.3 },
        boxes: [
          box([-1.75, 5, -1.75], [3.5, 3.5, 3.5], robe),
          box([-1.2, 5.3, 1.5], [2.4, 2.2, 0.4], SKIN),
        ],
      },
    ],
  };
}

export function elders(a: RoomAnchors): MemberArt {
  const table = inRoom(a, [7, 2, 5]);
  const seats = a.seats ?? [a.figure];
  return {
    placed: [
      ...seats.map((s, i) => elder(s, Math.atan2(table[0] - s[0], table[2] - s[2]), i)),
      {
        at: table,
        parts: [
          {
            glow: 1,
            pivot: [0, 0, 0],
            motion: { axis: [0, 1, 0], slide: true, rest: -1.2, offset: 1, amp: 0.8, speed: 1.4 },
            boxes: [
              box([-1.5, 1, -1.5], [3, 3, 3], C.accent),
              box([-1, 0.5, -1], [2, 4, 2], 0xfff0c0),
            ],
          },
        ],
      },
      markAbove(table, 9),
    ],
    sparks: [table[0], table[1] + 1, table[2]],
    sparkColor: C.accent,
  };
}
