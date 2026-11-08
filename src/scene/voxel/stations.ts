// Compact voxel descriptions of each room's fixed furniture, in room-local
// coordinates: x 0..13 left to right, y 0..8 up from the floor surface,
// z 0..9 from the back wall towards the open front. Props and figures are
// ticket 4; these are the stations they stand on.

import type { StationKind } from '../../config/members';
import type { Vec3, VoxelOp } from './grid';

export type StationLight = {
  readonly at: Vec3;
  readonly color: number;
  readonly radius: number;
  readonly intensity: number;
};

export type Station = {
  readonly ops: readonly VoxelOp[];
  /** Where the role prop goes (top surface of its furniture). */
  readonly prop: Vec3;
  /** Where the figure stands or sits. */
  readonly figure: Vec3;
  /** Wall lantern voxel (local), on the back wall at z = 0. */
  readonly lantern: Vec3;
  /** Extra baked light sources (screens, forge embers). */
  readonly lights?: readonly StationLight[];
  /** Extra seat anchors (council). */
  readonly seats?: readonly Vec3[];
};

const WOOD = 0x4a3020;
const DARK_WOOD = 0x2e1d14;
const IRON = 0x3a3c44;
const PAPER = 0xe6dcc0;
const BRICK = 0x6a3a2a;

const DEFAULT_FIGURE: Vec3 = [7, 0, 6.5];

/** Four legs plus a top: a table occupying [x, x+w) by [z, z+d), top at y = h - 1. */
function table(x: number, z: number, w: number, d: number, h: number, color: number): VoxelOp[] {
  const legs: VoxelOp[] = [
    [x, z],
    [x + w - 1, z],
    [x, z + d - 1],
    [x + w - 1, z + d - 1],
  ].map(([lx = 0, lz = 0]) => ({ at: [lx, 0, lz], size: [1, h - 1, 1], color: DARK_WOOD }));
  return [...legs, { at: [x, h - 1, z], size: [w, 1, d], color, jitter: 0.06 }];
}

/** Shelf with coloured rows (books, boxes) on its front face. */
function shelf(
  x: number,
  w: number,
  d: number,
  h: number,
  rowColors: readonly number[],
): VoxelOp[] {
  const ops: VoxelOp[] = [{ at: [x, 0, 0], size: [w, h, d], color: DARK_WOOD, jitter: 0.05 }];
  for (let row = 1; row < h - 1; row += 2) {
    const color = rowColors[(row >> 1) % rowColors.length] ?? PAPER;
    ops.push({ at: [x, row, d - 1], size: [w, 1, 1], color, jitter: 0.22 });
  }
  return ops;
}

function councilSeats(): { ops: VoxelOp[]; seats: Vec3[] } {
  const ops: VoxelOp[] = [];
  const seats: Vec3[] = [];
  const cx = 7;
  const cz = 5;
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + Math.PI / 2;
    const sx = Math.floor(cx + 4.2 * Math.cos(a));
    const sz = Math.floor(cz + 4.2 * Math.sin(a));
    seats.push([sx + 0.5, 1, sz + 0.5]);
    ops.push({ at: [sx, 0, sz], color: 0x5b3f78, jitter: 0.08 });
    const bx = Math.floor(cx + 5.1 * Math.cos(a));
    const bz = Math.floor(cz + 5.1 * Math.sin(a));
    if (bx >= 0 && bx < 14 && bz >= 0 && bz < 10 && (bx !== sx || bz !== sz))
      ops.push({ at: [bx, 0, bz], size: [1, 2, 1], color: 0x3f2a55, jitter: 0.08 });
  }
  return { ops, seats };
}

function roundTable(): VoxelOp[] {
  const ops: VoxelOp[] = [{ at: [6, 0, 4], size: [2, 1, 2], color: DARK_WOOD }];
  for (let z = 0; z < 10; z++)
    for (let x = 0; x < 14; x++) {
      const dx = x + 0.5 - 7;
      const dz = z + 0.5 - 5;
      const r2 = dx * dx + dz * dz;
      if (r2 <= 2.7 * 2.7)
        ops.push({ at: [x, 1, z], color: r2 < 1.4 * 1.4 ? 0xb08d57 : 0x5a3a22, jitter: 0.05 });
    }
  return ops;
}

export function buildStation(kind: StationKind): Station {
  switch (kind) {
    case 'throne':
      return {
        ops: [
          { at: [6, -1, 4], size: [2, 1, 6], color: 0x6a1e2a, jitter: 0.06 }, // carpet
          { at: [4, 0, 0], size: [6, 1, 4], color: 0x3a2a3a, jitter: 0.06 }, // dais
          { at: [6, 1, 0], size: [2, 6, 1], color: DARK_WOOD },
          { at: [6, 7, 0], size: [2, 1, 1], color: 0xd9a840 },
          { at: [6, 1, 1], size: [2, 1, 2], color: 0x4a1e30 },
          { at: [5, 1, 1], size: [1, 2, 2], color: DARK_WOOD },
          { at: [8, 1, 1], size: [1, 2, 2], color: DARK_WOOD },
          ...shelf(0, 3, 2, 8, [0x7a2a2a, 0x2a4a6a, 0x6a5a2a, 0x3a5a3a]),
          ...shelf(11, 3, 2, 8, [0x2a4a6a, 0x6a5a2a, 0x7a2a2a, 0x4a3a6a]),
          { at: [10, 0, 6], size: [1, 2, 1], color: WOOD }, // lectern
          { at: [1, 7, 1], glow: true, color: 0xffcc77 }, // candle on shelf
        ],
        prop: [10.5, 2, 6.5],
        figure: [7, 2, 2],
        lantern: [3, 3, 0],
      };
    case 'council': {
      const { ops, seats } = councilSeats();
      return {
        ops: [
          { at: [2, -1, 1], size: [10, 1, 8], color: 0x3b2440, jitter: 0.05 },
          ...roundTable(),
          ...ops,
        ],
        prop: [7, 2, 5],
        figure: seats[0] ?? DEFAULT_FIGURE,
        lantern: [1, 3, 0],
        lights: [{ at: [12, 5, 0], color: 0xf0c674, radius: 10, intensity: 1.2 }],
        seats,
      };
    }
    case 'mapTable':
      return {
        ops: [
          ...table(4, 3, 6, 4, 2, WOOD),
          { at: [5, 1, 4], size: [4, 1, 2], color: 0xcbb48a, jitter: 0.1 },
          ...[
            [6, 3, 0xe8dcb0],
            [8, 4, 0xf0c8a0],
            [10, 3, 0xbfd8e8],
            [7, 6, 0xe8dcb0],
            [11, 6, 0xf0c8a0],
            [9, 6, 0xe8dcb0],
            [12, 4, 0xbfd8e8],
          ].map(([x = 0, y = 0, color = PAPER]) => ({ at: [x, y, 0] as Vec3, color })),
        ],
        prop: [7, 2, 5],
        figure: DEFAULT_FIGURE,
        lantern: [2, 3, 0],
      };
    case 'drafting':
      return {
        ops: [
          { at: [5, 0, 4], size: [1, 2, 1], color: DARK_WOOD },
          { at: [8, 0, 4], size: [1, 2, 1], color: DARK_WOOD },
          { at: [5, 2, 4], size: [4, 1, 2], color: 0x8a6a48, jitter: 0.05 },
          { at: [5, 3, 3], size: [4, 1, 1], color: 0x8a6a48, jitter: 0.05 },
          { at: [6, 0, 7], color: WOOD },
          { at: [8, 3, 0], size: [5, 3, 1], color: 0x2f5a8f, jitter: 0.1 },
        ],
        prop: [7, 4, 4],
        figure: [7, 0, 7.5],
        lantern: [2, 3, 0],
      };
    case 'screens':
      return {
        ops: [
          ...table(3, 1, 8, 3, 2, 0x55555e),
          { at: [3, 2, 0], size: [9, 6, 1], color: 0x1e1e24 },
          { at: [4, 3, 0], size: [3, 2, 1], color: 0x66e0ff, glow: true },
          { at: [8, 3, 0], size: [3, 2, 1], color: 0x46b8e0, glow: true },
          { at: [6, 6, 0], size: [3, 1, 1], color: 0x8af0ff, glow: true },
          { at: [6, 0, 5], color: 0x33333a },
        ],
        prop: [7, 3, 3],
        figure: [7, 0, 6.5],
        lantern: [13, 3, 0],
        lights: [{ at: [7, 4, 1], color: 0x66e0ff, radius: 9, intensity: 1.4 }],
      };
    case 'forge':
      return {
        ops: [
          { at: [1, 0, 0], size: [4, 4, 3], color: BRICK, jitter: 0.12 },
          { at: [2, 1, 2], size: [2, 2, 1], carve: true },
          { at: [2, 1, 1], size: [2, 1, 1], color: 0xff7a2e, glow: true },
          { at: [2, 4, 0], size: [2, 5, 1], color: 0x4a2a22, jitter: 0.1 },
          { at: [8, 0, 4], color: IRON },
          { at: [7, 1, 4], size: [3, 1, 1], color: 0x50545c },
          { at: [12, 0, 0], size: [1, 9, 1], color: 0x9a5a32, jitter: 0.06 },
          { at: [10, 7, 0], size: [2, 1, 1], color: 0x9a5a32, jitter: 0.06 },
        ],
        prop: [8.5, 2, 4.5],
        figure: [8.5, 0, 6.5],
        lantern: [7, 3, 0],
        lights: [{ at: [3, 1, 2.5], color: 0xff7a2e, radius: 9, intensity: 2.2 }],
      };
    case 'testChamber':
      return {
        ops: [
          ...Array.from({ length: 7 }, (_, i): VoxelOp => ({
            at: [i * 2, -1, 8],
            size: [1, 1, 2],
            color: 0x9a8a2a,
          })),
          { at: [1, 5, 0], size: [12, 1, 1], color: IRON },
          { at: [1, 0, 5], size: [3, 1, 2], color: 0x2a2a34 },
          { at: [12, 7, 0], color: 0xff3b3b, glow: true },
        ],
        prop: [9.5, 0, 2.5],
        figure: [5, 0, 6.5],
        lantern: [6, 3, 0],
      };
    case 'sewing':
      return {
        ops: [
          ...table(4, 3, 6, 3, 2, 0x9a7a58),
          { at: [7, 4, 0], size: [6, 1, 1], color: WOOD },
          { at: [7, 5, 0], color: 0xd9779c },
          { at: [9, 5, 0], color: 0x5a7fbc },
          { at: [11, 5, 0], color: 0xeeeeee },
          { at: [6, 0, 7], color: WOOD },
        ],
        prop: [7, 2, 4.5],
        figure: [7, 0, 7.5],
        lantern: [2, 3, 0],
      };
    case 'guardPost':
      return {
        ops: [
          { at: [1, 0, 0], size: [2, 2, 2], color: WOOD, jitter: 0.1 },
          { at: [9, 4, -1], size: [3, 2, 1], carve: true }, // window to the night
          { at: [9, 3, 0], size: [3, 1, 1], color: DARK_WOOD },
          { at: [4, 0, 3], size: [1, 3, 1], color: IRON },
          { at: [8, 0, 6], color: WOOD },
        ],
        prop: [4.5, 3, 3.5],
        figure: [7, 0, 6.5],
        lantern: [2, 3, 0],
      };
    case 'machinery':
      return {
        ops: [
          { at: [0, 6, 0], size: [14, 1, 1], color: 0x9a5a32, jitter: 0.06 },
          { at: [3, 0, 0], size: [1, 6, 1], color: 0x9a5a32, jitter: 0.06 },
          { at: [9, 0, 2], size: [4, 5, 3], color: 0x34363c, jitter: 0.08 },
          { at: [10, 5, 3], size: [1, 3, 1], color: 0x9a5a32 },
          { at: [10, 3, 5], color: 0xffc861, glow: true },
          { at: [3, 3, 1], color: 0xa02a2a },
          { at: [1, 0, 5], size: [3, 1, 2], color: WOOD },
        ],
        prop: [2.5, 1, 6],
        figure: [6, 0, 6.5],
        lantern: [6, 3, 0],
        lights: [{ at: [10.5, 3.5, 6], color: 0xffc861, radius: 6, intensity: 1 }],
      };
    case 'archive':
      return {
        ops: [
          ...shelf(0, 5, 2, 8, [0xc8b088, 0xa89068, 0xd8c8a0]),
          ...shelf(9, 5, 2, 8, [0xa89068, 0xd8c8a0, 0xc8b088]),
          { at: [5, 0, 5], size: [4, 1, 2], color: WOOD },
          { at: [6, 1, 5], size: [2, 1, 1], color: PAPER, jitter: 0.08 },
        ],
        prop: [10.5, 0, 6.5],
        figure: [7, 0, 7.5],
        lantern: [7, 3, 0],
      };
    case 'drumHall':
      return {
        ops: [
          { at: [9, 0, 0], size: [2, 7, 2], color: 0x22262e },
          { at: [12, 0, 0], size: [2, 7, 2], color: 0x22262e },
          ...[
            [9, 1],
            [10, 3],
            [9, 5],
            [12, 2],
            [13, 4],
            [12, 6],
          ].map(([x = 0, y = 0]): VoxelOp => ({ at: [x, y, 2], color: 0x7affc8, glow: true })),
          { at: [1, 0, 3], size: [6, 1, 4], color: 0x5a3b22, jitter: 0.08 },
        ],
        prop: [4, 1, 5],
        figure: [4, 1, 6],
        lantern: [3, 3, 0],
        lights: [{ at: [11, 4, 3], color: 0x7affc8, radius: 6, intensity: 0.8 }],
      };
    case 'paperWorkshop':
      return {
        ops: [
          { at: [4, 0, 3], size: [6, 1, 3], color: 0x3a1a22 },
          { at: [1, 0, 0], size: [2, 3, 2], color: PAPER, jitter: 0.05 },
          { at: [10, 8, 4], color: IRON },
          { at: [10, 6, 4], size: [1, 2, 1], color: 0xffd8e4, glow: true },
        ],
        prop: [7, 1, 4.5],
        figure: [7, 0, 7],
        lantern: [4, 3, 0],
        lights: [{ at: [10.5, 6.5, 4.5], color: 0xffb0c8, radius: 7, intensity: 1 }],
      };
    default: {
      const unreachable: never = kind;
      throw new Error(`unknown station ${String(unreachable)}`);
    }
  }
}
