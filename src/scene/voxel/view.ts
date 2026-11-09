// Pure camera maths for the isometric rig (kept here so it can be unit tested).

import type { Vec3 } from './grid';
import type { Box } from './layout';

/** Unit vector from the target towards the camera (three.js Spherical convention). */
export function viewDirection(azimuth: number, polar: number): Vec3 {
  const s = Math.sin(polar);
  return [s * Math.sin(azimuth), Math.cos(polar), s * Math.cos(azimuth)];
}

/** Width and height of the box projected onto the view plane, in world units. */
export function projectedExtent(box: Box, azimuth: number, polar: number): [number, number] {
  const [dx, dy, dz] = viewDirection(azimuth, polar);
  // Right = normalize(up x dir) with up = +y; screen up = dir x right.
  const rl = Math.hypot(dz, dx);
  const rx = dz / rl;
  const rz = -dx / rl;
  const ux = dy * rz;
  const uy = dz * rx - dx * rz;
  const uz = -dy * rx;
  const cx = (box.min[0] + box.max[0]) / 2;
  const cy = (box.min[1] + box.max[1]) / 2;
  const cz = (box.min[2] + box.max[2]) / 2;
  let w = 0;
  let h = 0;
  for (let i = 0; i < 8; i++) {
    const x = (i & 1 ? box.max[0] : box.min[0]) - cx;
    const y = (i & 2 ? box.max[1] : box.min[1]) - cy;
    const z = (i & 4 ? box.max[2] : box.min[2]) - cz;
    w = Math.max(w, Math.abs(x * rx + z * rz));
    h = Math.max(h, Math.abs(x * ux + y * uy + z * uz));
  }
  return [w * 2, h * 2];
}

/**
 * Orthographic zoom (pixels per world unit) that fits the box in a viewport,
 * leaving `margin` (0..1) of the smaller fit as a border.
 */
export function fitZoom(
  box: Box,
  azimuth: number,
  polar: number,
  width: number,
  height: number,
  margin = 0.92,
): number {
  const [w, h] = projectedExtent(box, azimuth, polar);
  return Math.min(width / w, height / h) * margin;
}

/** Clamps v into the box, in place. Returns true when it moved. */
export function clampInto(v: { x: number; y: number; z: number }, box: Box): boolean {
  const x = Math.min(box.max[0], Math.max(box.min[0], v.x));
  const y = Math.min(box.max[1], Math.max(box.min[1], v.y));
  const z = Math.min(box.max[2], Math.max(box.min[2], v.z));
  const moved = x !== v.x || y !== v.y || z !== v.z;
  v.x = x;
  v.y = y;
  v.z = z;
  return moved;
}
