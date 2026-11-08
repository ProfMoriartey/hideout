import { describe, expect, it } from 'vitest';
import { MEMBERS } from '../../config/members';
import { ROOM_ANCHORS } from '../voxel/hideout';
import { buildArts } from './arts';
import { buildCast, buildSparks, SPARKS_PER_MEMBER } from './figure';

const arts = buildArts();

describe('member art', () => {
  it('has art for all 13 members, in MEMBERS order', () => {
    expect(arts).toHaveLength(MEMBERS.length);
    expect(MEMBERS).toHaveLength(13);
  });

  it('builds one geometry with every attribute the shader reads, all finite', () => {
    const { geometry, stats } = buildCast(arts);
    const n = stats.vertices;
    for (const [name, size] of [
      ['position', 3],
      ['color', 3],
      ['pivot', 3],
      ['axis', 4],
      ['motion', 4],
      ['info', 4],
    ] as const) {
      const attr = geometry.getAttribute(name);
      expect(attr.count, name).toBe(n);
      expect(attr.itemSize, name).toBe(size);
      expect(Array.from(attr.array).every(Number.isFinite), name).toBe(true);
    }
    // Budget: the whole cast stays a small fraction of the structure's ~23k triangles.
    expect(stats.triangles).toBeLessThan(15000);
    geometry.dispose();
  });

  it('tags every vertex with a valid member index, and every member has a "?" and body', () => {
    const { geometry } = buildCast(arts);
    const info = geometry.getAttribute('info');
    const kinds = MEMBERS.map(() => new Set<number>());
    for (let i = 0; i < info.count; i++) {
      const m = info.getX(i);
      expect(Number.isInteger(m) && m >= 0 && m < MEMBERS.length).toBe(true);
      kinds[m]?.add(info.getW(i));
    }
    kinds.forEach((k, i) => {
      expect(k.has(1), `${MEMBERS[i]?.id} body`).toBe(true);
      expect(k.has(2), `${MEMBERS[i]?.id} stale mark`).toBe(true);
    });
    geometry.dispose();
  });

  it('keeps each member inside its own room (bar the "?" above the head)', () => {
    const { geometry } = buildCast(arts);
    const pos = geometry.getAttribute('position');
    const info = geometry.getAttribute('info');
    for (let i = 0; i < pos.count; i++) {
      if (info.getW(i) === 2) continue;
      const member = MEMBERS[info.getX(i)];
      if (!member) throw new Error('no member');
      const { min, max } = ROOM_ANCHORS[member.id].box;
      const at = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      const slack = 0.1; // a back-row elder leans against the wall
      at.forEach((v, axis) => {
        expect(v, `${member.id} axis ${axis}`).toBeGreaterThanOrEqual((min[axis] ?? 0) - slack);
        expect(v, `${member.id} axis ${axis}`).toBeLessThanOrEqual((max[axis] ?? 0) + slack);
      });
    }
    geometry.dispose();
  });

  it('winds every face counter-clockwise seen from outside (front faces render)', () => {
    const { geometry } = buildCast(arts);
    const pos = geometry.getAttribute('position');
    const index = geometry.getIndex();
    if (!index) throw new Error('no index');
    // Each box is 6 quads of 4 vertices; check the quad normal points away from the box centre.
    for (let q = 0; q < index.count; q += 6 * 6) {
      const verts: number[][] = [];
      for (let k = 0; k < 24; k++) {
        const v = index.getX(q + Math.floor(k / 4) * 6) + (k % 4);
        verts.push([pos.getX(v), pos.getY(v), pos.getZ(v)]);
      }
      const centre = [0, 1, 2].map((a) => verts.reduce((s, v) => s + (v[a] ?? 0), 0) / 24);
      for (let f = 0; f < 6; f++) {
        const [a, b, c] = [verts[f * 4], verts[f * 4 + 1], verts[f * 4 + 2]];
        if (!a || !b || !c) throw new Error('short quad');
        const u = [0, 1, 2].map((i) => (b[i] ?? 0) - (a[i] ?? 0));
        const w = [0, 1, 2].map((i) => (c[i] ?? 0) - (a[i] ?? 0));
        const n = [
          (u[1] ?? 0) * (w[2] ?? 0) - (u[2] ?? 0) * (w[1] ?? 0),
          (u[2] ?? 0) * (w[0] ?? 0) - (u[0] ?? 0) * (w[2] ?? 0),
          (u[0] ?? 0) * (w[1] ?? 0) - (u[1] ?? 0) * (w[0] ?? 0),
        ];
        const out = [0, 1, 2].map((i) => (a[i] ?? 0) - (centre[i] ?? 0));
        expect([0, 1, 2].reduce((d, k) => d + (n[k] ?? 0) * (out[k] ?? 0), 0)).toBeGreaterThan(0);
      }
    }
    geometry.dispose();
  });

  it('gives every member its particles', () => {
    const g = buildSparks(arts);
    expect(g.getAttribute('position').count).toBe(MEMBERS.length * SPARKS_PER_MEMBER);
    g.dispose();
  });
});
