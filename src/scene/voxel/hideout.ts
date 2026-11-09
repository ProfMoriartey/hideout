// Assembles the whole hideout: rock shell, floor slabs, pillars and one room
// per member, then meshes it into a handful of geometries (one solid and one
// glow geometry for the shell and for each room).

import type { BufferGeometry } from 'three';
import { MEMBERS, type Member, type MemberId } from '../../config/members';
import { hash3, LAYER_GLOW, LAYER_SOLID, VoxelGrid, type Vec3, type VoxelOp } from './grid';
import {
  COLS,
  FLOORS,
  HALL_X0,
  HALL_X1,
  PITCH_X,
  PITCH_Y,
  ROOM,
  SCENE_BOUNDS,
  SLAB_D,
  boxCenter,
  roomBox,
  type Box,
} from './layout';
import { buildVoxelGeometry, type BakedLight, type MeshStats } from './mesh';
import { buildStation, type Station } from './stations';

/** World-space anchors for tickets 4-5 (1 unit = 1 voxel). */
export type RoomAnchors = {
  /** Where the member's figure stands or sits. */
  readonly figure: Vec3;
  /** Top surface for the role prop. */
  readonly prop: Vec3;
  /** Below the room's open front (on the floor edge), for the name label. */
  readonly label: Vec3;
  /** Wall lantern centre (glow position for RoomLights). */
  readonly light: Vec3;
  /** Room interior centre and box, for camera focus. */
  readonly center: Vec3;
  readonly box: Box;
  /** Elders only: the 11 council seats. */
  readonly seats?: readonly Vec3[];
};

const STONE = 0x48404a;
const ROCK = [0x3a3540, 0x433e4a, 0x332f39] as const;
const LANTERN = 0xffb347;
const AMBIENT: Vec3 = [0.17, 0.18, 0.27];

function hexToLinear(hex: number): Vec3 {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}

function mixColor(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

const stations = new Map<MemberId, Station>(MEMBERS.map((m) => [m.id, buildStation(m.station)]));

function stationOf(id: MemberId): Station {
  const s = stations.get(id);
  if (!s) throw new Error(`no station for ${id}`);
  return s;
}

function computeAnchors(member: Member): RoomAnchors {
  const box = roomBox(member.slot);
  const s = stationOf(member.id);
  const o = box.min;
  const anchors: RoomAnchors = {
    figure: add(o, s.figure),
    prop: add(o, s.prop),
    label: [(box.min[0] + box.max[0]) / 2, box.min[1] - 0.5, box.max[2] + 0.5],
    light: add(o, [s.lantern[0] + 0.5, s.lantern[1] + 0.5, s.lantern[2] + 0.5]),
    center: boxCenter(box),
    box,
  };
  return s.seats ? { ...anchors, seats: s.seats.map((p) => add(o, p)) } : anchors;
}

export const ROOM_ANCHORS = Object.fromEntries(MEMBERS.map((m) => [m.id, computeAnchors(m)])) as {
  readonly [K in MemberId]: RoomAnchors;
};

/** Room shell parts plus its station, in room-local coordinates. */
function roomOps(member: Member, station: Station): VoxelOp[] {
  const { primary, accent } = member.colors;
  const wall = mixColor(STONE, primary, 0.45);
  const plank = mixColor(0x3a2a20, primary, 0.15);
  const ops: VoxelOp[] = [];
  // Floor planks (the slab below the room), front beam darker.
  for (let x = 0; x < ROOM.w; x += 2)
    ops.push({
      at: [x, -1, -1],
      size: [2, 1, SLAB_D],
      color: x % 4 === 0 ? plank : mixColor(plank, 0x000000, 0.12),
      jitter: 0.08,
    });
  ops.push({ at: [0, -1, ROOM.d - 1], size: [ROOM.w, 1, 1], color: 0x24170f, jitter: 0.06 });
  // Back wall with a darker wainscot band.
  ops.push({ at: [0, 0, -1], size: [ROOM.w, ROOM.h, 1], color: wall, jitter: 0.1 });
  ops.push({
    at: [0, 0, -1],
    size: [ROOM.w, 2, 1],
    color: mixColor(wall, 0x000000, 0.3),
    jitter: 0.08,
  });
  ops.push(...station.ops);
  // Wall lantern: bracket, glow, cap.
  const [lx, ly, lz] = station.lantern;
  ops.push({ at: [lx, ly - 1, lz], color: 0x1a1a1e });
  ops.push({ at: [lx, ly, lz], color: mixColor(LANTERN, accent, 0.3), glow: true });
  ops.push({ at: [lx, ly + 1, lz], color: 0x1a1a1e });
  return ops;
}

function roomLights(member: Member, station: Station): BakedLight[] {
  const o = roomBox(member.slot).min;
  const lights: BakedLight[] = [
    {
      position: add(o, [station.lantern[0] + 0.5, station.lantern[1] + 0.5, 1.4]),
      color: hexToLinear(mixColor(LANTERN, member.colors.accent, 0.2)),
      radius: 14,
      intensity: 2.6,
    },
  ];
  for (const l of station.lights ?? [])
    lights.push({
      position: add(o, l.at),
      color: hexToLinear(l.color),
      radius: l.radius,
      intensity: l.intensity,
    });
  return lights;
}

/** Rock, pillars, roofs, crags and the outside lanterns. Group 0. */
function shellOps(): { ops: VoxelOp[]; lights: BakedLight[] } {
  const ops: VoxelOp[] = [];
  const lights: BakedLight[] = [];
  const topY = (FLOORS - 1) * PITCH_Y; // roof of the side columns, floor of the tower
  const topR = FLOORS * PITCH_Y; // the right column has a fifth floor (Franklin)
  const towerX0 = HALL_X0 + PITCH_X; // left tower wall
  const towerX1 = HALL_X0 + 2 * PITCH_X; // right tower wall
  const rock = (x: number, y: number, z: number): VoxelOp => ({
    at: [x, y, z],
    color: ROCK[Math.floor(hash3(x, y >> 1, z) * ROCK.length)] ?? ROCK[0],
    jitter: 0.12,
  });

  // Pillars between and around rooms, up to the side roofs; tower walls go higher.
  for (let c = 0; c <= COLS; c++) {
    const x = HALL_X0 + c * PITCH_X;
    const tower = x === towerX0 || x === towerX1;
    const h = tower || c === COLS ? FLOORS * PITCH_Y + 1 : topY + 1;
    ops.push({ at: [x, 0, 0], size: [1, h, SLAB_D], color: STONE, jitter: 0.12 });
  }
  // Side roofs and the tower roof.
  ops.push({ at: [HALL_X0, topY, 0], size: [PITCH_X, 1, SLAB_D], color: STONE, jitter: 0.1 });
  ops.push({ at: [towerX1, topY, 0], size: [PITCH_X + 1, 1, SLAB_D], color: STONE, jitter: 0.1 });
  ops.push({ at: [towerX1, topR, 0], size: [PITCH_X + 1, 1, SLAB_D], color: STONE, jitter: 0.1 });
  ops.push({
    at: [towerX0, FLOORS * PITCH_Y, 0],
    size: [PITCH_X + 1, 1, SLAB_D],
    color: STONE,
    jitter: 0.1,
  });
  // Battlements on the tower.
  for (let x = towerX0; x <= towerX1; x += 2)
    ops.push({ at: [x, FLOORS * PITCH_Y + 1, SLAB_D - 1], color: STONE, jitter: 0.1 });

  // Crags on the side roofs, rising towards the cliff edges.
  for (let x = HALL_X0; x < HALL_X1; x++) {
    if (x >= towerX0 && x <= towerX1) continue;
    const fromTower = x <= towerX0 ? towerX0 - x : x - towerX1;
    const h = 1 + Math.floor(fromTower * 0.38 + hash3(x, 7, 1) * 2.2);
    const depth = 4 + Math.floor(hash3(x, 3, 9) * 3) + (fromTower > 3 ? 2 : 0);
    const base = x > towerX1 ? topR : topY;
    for (let y = base + 1; y <= base + h; y++)
      for (let z = 0; z < Math.min(depth - (y - base) * 0.3, SLAB_D); z++) ops.push(rock(x, y, z));
  }

  // Cliff rock on both sides, ragged at the front.
  for (let y = -4; y <= topR + 7; y++) {
    for (const side of [-1, 1] as const) {
      const base = side < 0 ? topY : topR;
      const top = y > base ? Math.max(0, 1 - (y - base) / 9) : 1;
      const thick = Math.max(1, Math.round((3 + hash3(side, y >> 1, 4) * 4) * top));
      for (let i = 1; i <= thick; i++) {
        const x = side < 0 ? HALL_X0 - i : HALL_X1 - 1 + i;
        const front = SLAB_D - 1 - Math.floor(hash3(x, y >> 1, 2) * 3) + (y < 0 ? 2 : 0);
        for (let z = 0; z <= front; z++) ops.push(rock(x, y, z));
      }
    }
  }
  // Rock base under the hall.
  for (let y = -4; y < 0; y++)
    for (let x = HALL_X0; x < HALL_X1; x++) {
      const front = SLAB_D + Math.floor(hash3(x >> 1, y, 5) * 2.5) - (y === -1 ? 1 : 0);
      for (let z = 0; z <= front; z++) ops.push(rock(x, y, z));
    }

  // The free ground-floor slot is solid rock, not a hole.
  const free = roomBox({ col: COLS - 1, floor: 0 });
  for (let y = free.min[1]; y < free.max[1]; y++)
    for (let x = free.min[0]; x < free.max[0]; x++)
      for (let z = 0; z < SLAB_D; z++) ops.push(rock(x, y, z));

  // Hanging lanterns on the inner pillar fronts, one per floor, and two on the tower.
  const lantern = (x: number, y: number) => {
    ops.push({ at: [x, y + 1, SLAB_D], color: 0x1a1a1e });
    ops.push({ at: [x, y, SLAB_D], color: LANTERN, glow: true });
    lights.push({
      position: [x + 0.5, y + 0.5, SLAB_D + 1],
      color: hexToLinear(LANTERN),
      radius: 9,
      intensity: 1.6,
    });
  };
  for (let f = 0; f < FLOORS - 1; f++) {
    lantern(towerX0, f * PITCH_Y + 6);
    lantern(towerX1, f * PITCH_Y + 6);
  }
  lantern(towerX0, (FLOORS - 1) * PITCH_Y + 6);
  lantern(towerX1, (FLOORS - 1) * PITCH_Y + 6);
  return { ops, lights };
}

export type BuiltRoom = {
  readonly id: MemberId;
  readonly solid: BufferGeometry;
  readonly glow: BufferGeometry;
};

export type BuiltHideout = {
  readonly shell: { readonly solid: BufferGeometry; readonly glow: BufferGeometry };
  readonly rooms: readonly BuiltRoom[];
  readonly stats: MeshStats & { geometries: number; voxels: number };
  dispose(): void;
};

/** Builds the voxel world into a grid (exported for tests). */
export function buildHideoutGrid(): { grid: VoxelGrid; shellLights: BakedLight[] } {
  const { min, max } = SCENE_BOUNDS;
  const grid = new VoxelGrid(min, [max[0] - min[0], max[1] - min[1], max[2] - min[2]]);
  const shell = shellOps();
  grid.apply(shell.ops, 0);
  MEMBERS.forEach((m, i) => {
    grid.apply(roomOps(m, stationOf(m.id)), i + 1, roomBox(m.slot).min);
  });
  return { grid, shellLights: shell.lights };
}

export function buildHideout(): BuiltHideout {
  const { grid, shellLights } = buildHideoutGrid();
  const cull = { cullNegY: true, cullNegZ: true } as const;
  const allRoomLights = MEMBERS.flatMap((m) => roomLights(m, stationOf(m.id)));
  const totals = { faces: 0, triangles: 0, vertices: 0 };
  const geoms: BufferGeometry[] = [];
  const mesh = (group: number, glow: boolean, lights: BakedLight[]) => {
    const { geometry, stats } = buildVoxelGeometry(grid, group, glow ? LAYER_GLOW : LAYER_SOLID, {
      ...cull,
      ambient: AMBIENT,
      lights,
    });
    totals.faces += stats.faces;
    totals.triangles += stats.triangles;
    totals.vertices += stats.vertices;
    geoms.push(geometry);
    return geometry;
  };
  const shell = {
    solid: mesh(0, false, [...shellLights, ...allRoomLights]),
    glow: mesh(0, true, []),
  };
  const rooms = MEMBERS.map((m, i) => {
    const lights = [...roomLights(m, stationOf(m.id)), ...shellLights];
    return { id: m.id, solid: mesh(i + 1, false, lights), glow: mesh(i + 1, true, []) };
  });
  return {
    shell,
    rooms,
    stats: { ...totals, geometries: geoms.length, voxels: grid.count() },
    dispose: () => geoms.forEach((g) => g.dispose()),
  };
}
