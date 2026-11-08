// Hideout grid layout: where each room sits, in voxel units (1 voxel = 1 world
// unit). The hall is a cutaway: back wall at z = 0, open front at z = ROOM.d + 1.

import type { RoomSlot } from '../../config/members';
import type { Vec3 } from './grid';

/** Room interior size in voxels. */
export const ROOM = { w: 14, h: 9, d: 10 } as const;
export const COLS = 3;
export const FLOORS = 5;
/** Distance between room origins (interior plus one wall or slab). */
export const PITCH_X = ROOM.w + 1;
export const PITCH_Y = ROOM.h + 1;
/** Outer x of the left wall; the hall spans [HALL_X0, -HALL_X0]. */
export const HALL_X0 = -Math.floor((COLS * PITCH_X + 1) / 2);
export const HALL_X1 = HALL_X0 + COLS * PITCH_X + 1;
/** Depth of floor slabs and side walls (z from 0 to SLAB_D - 1). */
export const SLAB_D = ROOM.d + 1;

export type Box = { readonly min: Vec3; readonly max: Vec3 };

/** Interior box of the room in a slot (min inclusive corner, max exclusive corner). */
export function roomBox(slot: RoomSlot): Box {
  const x = HALL_X0 + 1 + slot.col * PITCH_X;
  const y = slot.floor * PITCH_Y + 1;
  const z = 1;
  return { min: [x, y, z], max: [x + ROOM.w, y + ROOM.h, z + ROOM.d] };
}

/**
 * Generous bounds of everything the structure builds (rock included). The
 * voxel grid is allocated to this size and the camera fits and clamps to it.
 */
export const SCENE_BOUNDS: Box = {
  min: [HALL_X0 - 7, -5, -2],
  max: [HALL_X1 + 7, FLOORS * PITCH_Y + 9, SLAB_D + 4],
};

/** The part the default camera view has to show. */
export const VIEW_BOUNDS: Box = {
  min: [HALL_X0 - 4, -4, 0],
  max: [HALL_X1 + 4, FLOORS * PITCH_Y + 4, SLAB_D + 1],
};

export function boxCenter(box: Box): [number, number, number] {
  return [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
}
