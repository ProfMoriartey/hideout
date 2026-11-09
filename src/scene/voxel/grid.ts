// Dense voxel grid with per-voxel colour, group and layer. Groups let one
// world be meshed into several geometries (shell, one per room) while face
// culling and ambient occlusion still see every neighbour.

export type Vec3 = readonly [number, number, number];

/** Solid voxels get baked light; glow voxels are unlit lantern colour. */
export const LAYER_SOLID = 1;
export const LAYER_GLOW = 2;
export type Layer = typeof LAYER_SOLID | typeof LAYER_GLOW;

/** One box of voxels in a compact voxel description. */
export type VoxelOp = {
  /** Min corner [x, y, z] in voxels. */
  readonly at: Vec3;
  /** Size [w, h, d] in voxels (default 1x1x1). */
  readonly size?: Vec3;
  /** sRGB hex colour. Ignored when `carve` is set. */
  readonly color?: number;
  /** Brightness noise amplitude, 0..0.3 (default 0). */
  readonly jitter?: number;
  readonly glow?: boolean;
  /** Remove voxels instead of adding them. */
  readonly carve?: boolean;
};

/** Deterministic hash of integer coordinates to [0, 1). */
export function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Scales an sRGB hex colour's brightness by `k`, clamped. */
export function shade(color: number, k: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((color & 255) * k)));
  return (r << 16) | (g << 8) | b;
}

export class VoxelGrid {
  readonly min: Vec3;
  readonly size: Vec3;
  private readonly colors: Uint32Array;
  /** Low 2 bits: layer (0 = empty). Upper bits: group. */
  private readonly meta: Uint16Array;

  constructor(min: Vec3, size: Vec3) {
    this.min = min;
    this.size = size;
    const n = size[0] * size[1] * size[2];
    this.colors = new Uint32Array(n);
    this.meta = new Uint16Array(n);
  }

  private index(x: number, y: number, z: number): number {
    const ix = x - this.min[0];
    const iy = y - this.min[1];
    const iz = z - this.min[2];
    if (
      ix < 0 ||
      iy < 0 ||
      iz < 0 ||
      ix >= this.size[0] ||
      iy >= this.size[1] ||
      iz >= this.size[2]
    )
      return -1;
    return (iz * this.size[1] + iy) * this.size[0] + ix;
  }

  set(x: number, y: number, z: number, color: number, group = 0, layer: Layer = LAYER_SOLID) {
    const i = this.index(x, y, z);
    if (i < 0) throw new RangeError(`voxel (${x}, ${y}, ${z}) outside grid`);
    this.colors[i] = color;
    this.meta[i] = (group << 2) | layer;
  }

  clear(x: number, y: number, z: number) {
    const i = this.index(x, y, z);
    if (i >= 0) this.meta[i] = 0;
  }

  /** True when a voxel of any layer is at (x, y, z). Outside the grid is empty. */
  has(x: number, y: number, z: number): boolean {
    const i = this.index(x, y, z);
    return i >= 0 && (this.meta[i] ?? 0) !== 0;
  }

  /** Layer at (x, y, z), or 0 when empty. */
  layerAt(x: number, y: number, z: number): number {
    const i = this.index(x, y, z);
    return i < 0 ? 0 : (this.meta[i] ?? 0) & 3;
  }

  groupAt(x: number, y: number, z: number): number {
    const i = this.index(x, y, z);
    return i < 0 ? -1 : (this.meta[i] ?? 0) >> 2;
  }

  colorAt(x: number, y: number, z: number): number {
    const i = this.index(x, y, z);
    return i < 0 ? 0 : (this.colors[i] ?? 0);
  }

  /** Applies a compact description, translated by `offset`, into `group`. */
  apply(ops: readonly VoxelOp[], group = 0, offset: Vec3 = [0, 0, 0]) {
    for (const op of ops) {
      const [w, h, d] = op.size ?? [1, 1, 1];
      const x0 = op.at[0] + offset[0];
      const y0 = op.at[1] + offset[1];
      const z0 = op.at[2] + offset[2];
      const layer: Layer = op.glow ? LAYER_GLOW : LAYER_SOLID;
      const color = op.color ?? 0xff00ff;
      const jitter = op.jitter ?? 0;
      for (let z = z0; z < z0 + d; z++)
        for (let y = y0; y < y0 + h; y++)
          for (let x = x0; x < x0 + w; x++) {
            if (op.carve) {
              this.clear(x, y, z);
              continue;
            }
            const c = jitter ? shade(color, 1 + (hash3(x, y, z) * 2 - 1) * jitter) : color;
            this.set(x, y, z, c, group, layer);
          }
    }
  }

  /** Number of filled voxels (any layer). */
  count(): number {
    let n = 0;
    for (const m of this.meta) if (m !== 0) n++;
    return n;
  }

  /** Calls `fn` for every filled voxel of `group` and `layer`. */
  forEach(
    group: number,
    layer: Layer,
    fn: (x: number, y: number, z: number, color: number) => void,
  ) {
    const [sx, sy, sz] = this.size;
    const want = (group << 2) | layer;
    for (let iz = 0; iz < sz; iz++)
      for (let iy = 0; iy < sy; iy++)
        for (let ix = 0; ix < sx; ix++) {
          const i = (iz * sy + iy) * sx + ix;
          if (this.meta[i] === want)
            fn(ix + this.min[0], iy + this.min[1], iz + this.min[2], this.colors[i] ?? 0);
        }
  }
}
