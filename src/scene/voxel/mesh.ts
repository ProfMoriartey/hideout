// Turns one group/layer of a VoxelGrid into a single BufferGeometry: only
// faces next to empty space are emitted, with per-vertex ambient occlusion and
// lantern light baked into linear vertex colours (no real lights needed).

import { BufferAttribute, BufferGeometry } from 'three';
import { LAYER_GLOW, type Layer, type Vec3, type VoxelGrid } from './grid';

export type BakedLight = {
  readonly position: Vec3;
  /** Linear RGB. */
  readonly color: Vec3;
  readonly radius: number;
  readonly intensity: number;
};

export type MeshOptions = {
  /** Linear RGB fill light (moonlight). */
  readonly ambient?: Vec3;
  readonly lights?: readonly BakedLight[];
  /**
   * Faces whose normal points along these directions are never visible from
   * the camera rig's clamped angles, so they are dropped.
   */
  readonly cullNegY?: boolean;
  readonly cullNegZ?: boolean;
};

export type MeshStats = { faces: number; triangles: number; vertices: number };

/** Per-direction shading: axis, sign, brightness. Order: +x -x +y -y +z -z. */
const DIRS = [
  { axis: 0, sign: 1, shade: 0.78 },
  { axis: 0, sign: -1, shade: 0.66 },
  { axis: 1, sign: 1, shade: 1.0 },
  { axis: 1, sign: -1, shade: 0.5 },
  { axis: 2, sign: 1, shade: 0.88 },
  { axis: 2, sign: -1, shade: 0.6 },
] as const;

const AO_LEVELS = [0.5, 0.68, 0.84, 1] as const;
/** The current face's four corner AO levels (reused; meshing is synchronous). */
const ao = new Uint8Array(4);
const DEFAULT_AMBIENT: Vec3 = [0.3, 0.32, 0.45];

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Lookup table: sRGB byte to linear float. */
const LINEAR = Float32Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255));

export function buildVoxelGeometry(
  grid: VoxelGrid,
  group: number,
  layer: Layer,
  options: MeshOptions = {},
): { geometry: BufferGeometry; stats: MeshStats } {
  const ambient = options.ambient ?? DEFAULT_AMBIENT;
  const lights = options.lights ?? [];
  const glow = layer === LAYER_GLOW;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const p = [0, 0, 0];
  const n = [0, 0, 0];
  const corner = [0, 0, 0];

  grid.forEach(group, layer, (x, y, z, color) => {
    const r = LINEAR[(color >> 16) & 255] ?? 0;
    const g = LINEAR[(color >> 8) & 255] ?? 0;
    const b = LINEAR[color & 255] ?? 0;
    for (const dir of DIRS) {
      if (dir.sign < 0 && dir.axis === 1 && options.cullNegY) continue;
      if (dir.sign < 0 && dir.axis === 2 && options.cullNegZ) continue;
      const a = dir.axis;
      const u = (a + 1) % 3;
      const v = (a + 2) % 3;
      // Cell in front of the face.
      p[0] = x;
      p[1] = y;
      p[2] = z;
      p[a] = (p[a] ?? 0) + dir.sign;
      const fx = p[0] ?? 0;
      const fy = p[1] ?? 0;
      const fz = p[2] ?? 0;
      if (grid.has(fx, fy, fz)) continue;
      n[0] = 0;
      n[1] = 0;
      n[2] = 0;
      n[a] = dir.sign;

      const base = positions.length / 3;
      let k4 = 0;
      // Corner order is counter-clockwise seen from outside the face.
      const order = dir.sign > 0 ? CORNERS_POS : CORNERS_NEG;
      for (const [cu, cv] of order) {
        corner[0] = x;
        corner[1] = y;
        corner[2] = z;
        corner[a] = (corner[a] ?? 0) + (dir.sign > 0 ? 1 : 0);
        corner[u] = (corner[u] ?? 0) + cu;
        corner[v] = (corner[v] ?? 0) + cv;
        const cx = corner[0] ?? 0;
        const cy = corner[1] ?? 0;
        const cz = corner[2] ?? 0;
        positions.push(cx, cy, cz);

        // Ambient occlusion from the three cells around this corner, in front of the face.
        const su = cu ? 1 : -1;
        const sv = cv ? 1 : -1;
        const s1 = occ(grid, fx, fy, fz, u, su, v, 0);
        const s2 = occ(grid, fx, fy, fz, u, 0, v, sv);
        const c = occ(grid, fx, fy, fz, u, su, v, sv);
        const level = s1 && s2 ? 0 : 3 - (s1 + s2 + c);
        ao[k4++] = level;
        const occl = AO_LEVELS[level] ?? 1;

        if (glow) {
          const k = 0.85 + 0.15 * dir.shade;
          colors.push(r * k, g * k, b * k);
          continue;
        }
        let lr = ambient[0] * dir.shade;
        let lg = ambient[1] * dir.shade;
        let lb = ambient[2] * dir.shade;
        for (const light of lights) {
          const dx = light.position[0] - cx;
          const dy = light.position[1] - cy;
          const dz = light.position[2] - cz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= light.radius * light.radius) continue;
          const dist = Math.sqrt(d2);
          const fall = 1 - dist / light.radius;
          // Half-wrapped lambert so faces turned slightly away still catch some light.
          const ndl =
            dist > 1e-3 ? ((n[0] ?? 0) * dx + (n[1] ?? 0) * dy + (n[2] ?? 0) * dz) / dist : 1;
          const wrap = Math.max(0, (ndl + 0.35) / 1.35);
          const k = light.intensity * fall * fall * wrap;
          lr += light.color[0] * k;
          lg += light.color[1] * k;
          lb += light.color[2] * k;
        }
        colors.push(
          Math.min(1, r * lr * occl),
          Math.min(1, g * lg * occl),
          Math.min(1, b * lb * occl),
        );
      }
      // Flip the diagonal so AO interpolates evenly.
      if ((ao[0] ?? 0) + (ao[2] ?? 0) < (ao[1] ?? 0) + (ao[3] ?? 0)) {
        indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      } else {
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  const vertexCount = positions.length / 3;
  geometry.setIndex(
    new BufferAttribute(
      vertexCount > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
      1,
    ),
  );
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  const faces = indices.length / 6;
  return { geometry, stats: { faces, triangles: faces * 2, vertices: vertexCount } };
}

const CORNERS_POS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;
const CORNERS_NEG = [
  [0, 0],
  [0, 1],
  [1, 1],
  [1, 0],
] as const;

function occ(
  grid: VoxelGrid,
  x: number,
  y: number,
  z: number,
  u: number,
  du: number,
  v: number,
  dv: number,
): number {
  // No scratch array: this runs 12 times per face.
  const ox = (u === 0 ? du : 0) + (v === 0 ? dv : 0);
  const oy = (u === 1 ? du : 0) + (v === 1 ? dv : 0);
  const oz = (u === 2 ? du : 0) + (v === 2 ? dv : 0);
  return grid.has(x + ox, y + oy, z + oz) ? 1 : 0;
}
