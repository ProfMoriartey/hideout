// Materials for the baked voxel geometry. Every room has its own pair so
// ticket 4 (RoomLights) can wake or dim a room by tinting its material
// colour, without touching geometry or adding real lights.

import { LineBasicMaterial, MeshBasicMaterial } from 'three';
import type { MemberId } from '../../config/members';

export type RoomMaterials = {
  /** Baked solid voxels. `color` multiplies the baked light: 1 = lit as built. */
  readonly solid: MeshBasicMaterial;
  /** Lantern and screen voxels. `color` multiplies the glow. */
  readonly glow: MeshBasicMaterial;
};

function solidMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
}

const rooms = new Map<MemberId, RoomMaterials>();

/** The material pair for a room; created once and shared for the page lifetime. */
export function getRoomMaterials(id: MemberId): RoomMaterials {
  let m = rooms.get(id);
  if (!m) {
    m = { solid: solidMaterial(), glow: solidMaterial() };
    m.solid.name = `room-${id}-solid`;
    m.glow.name = `room-${id}-glow`;
    rooms.set(id, m);
  }
  return m;
}

export const shellMaterials = {
  solid: solidMaterial(),
  glow: solidMaterial(),
  silk: new LineBasicMaterial({
    color: 0xd8deec,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    toneMapped: false,
  }),
} as const;
