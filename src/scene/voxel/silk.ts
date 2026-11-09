// Silk threads: sagging strands across the facade and a web in the upper
// corner, all in one LineSegments geometry (one draw call).

import { BufferAttribute, BufferGeometry } from 'three';
import type { Vec3 } from './grid';
import { FLOORS, HALL_X0, HALL_X1, PITCH_X, PITCH_Y, SLAB_D } from './layout';

function strand(out: number[], a: Vec3, b: Vec3, sag: number, segments = 12) {
  let px = a[0];
  let py = a[1];
  let pz = a[2];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t);
    const z = a[2] + (b[2] - a[2]) * t;
    out.push(px, py, pz, x, y, z);
    px = x;
    py = y;
    pz = z;
  }
}

function web(out: number[], center: Vec3, radius: number, spokes: number, rings: number) {
  const [cx, cy, cz] = center;
  const point = (k: number, r: number): Vec3 => {
    const a = (k / spokes) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz];
  };
  for (let k = 0; k < spokes; k++) {
    const p = point(k, radius);
    out.push(cx, cy, cz, p[0], p[1], p[2]);
  }
  for (let ring = 1; ring <= rings; ring++) {
    const r = (radius * ring) / rings;
    for (let k = 0; k < spokes; k++) {
      const p = point(k, r);
      const q = point(k + 1, r);
      // Rings sag slightly towards the centre between spokes.
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      const m: Vec3 = [mx + (cx - mx) * 0.08, my + (cy - my) * 0.08, cz];
      out.push(p[0], p[1], p[2], m[0], m[1], m[2], m[0], m[1], m[2], q[0], q[1], q[2]);
    }
  }
}

export function buildSilk(): BufferGeometry {
  const lines: number[] = [];
  const front = SLAB_D + 0.6;
  const topY = (FLOORS - 1) * PITCH_Y;
  const topR = FLOORS * PITCH_Y; // right column is one floor taller
  // Strands hanging between pillar tops on each floor.
  for (let f = 0; f < FLOORS - 1; f++) {
    const y = (f + 1) * PITCH_Y - 0.2;
    for (let c = 0; c < 3; c++) {
      if ((f + c) % 2 === 1) continue;
      const x0 = HALL_X0 + c * PITCH_X + 0.5;
      strand(lines, [x0, y, front], [x0 + PITCH_X, y, front], 1.4 + ((f * 3 + c) % 3) * 0.5);
    }
  }
  // Long diagonals from the cliff into the hall.
  strand(lines, [HALL_X0 - 3, topY + 5, 4], [HALL_X0 + PITCH_X, topY - 2, front], 2.5, 18);
  strand(lines, [HALL_X1 + 3, topR + 4, 4], [HALL_X1 - PITCH_X, topR + 1, front], 2, 18);
  // Webs in the cave corners above the side roofs.
  web(lines, [HALL_X0 + 5, topY + 6.5, 3.5], 4.5, 10, 5);
  web(lines, [HALL_X1 - 4, topR + 5.5, 3.5], 3.2, 8, 4);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(lines), 3));
  g.computeBoundingSphere();
  return g;
}
