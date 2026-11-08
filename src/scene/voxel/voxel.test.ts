import { describe, expect, it } from 'vitest';
import { MEMBERS, MEMBER_IDS } from '../../config/members';
import { LAYER_GLOW, LAYER_SOLID, VoxelGrid, hash3, shade } from './grid';
import { ROOM_ANCHORS, buildHideout, buildHideoutGrid } from './hideout';
import { SCENE_BOUNDS, VIEW_BOUNDS, roomBox } from './layout';
import { buildVoxelGeometry } from './mesh';
import { buildSilk } from './silk';
import { buildStation } from './stations';
import { clampInto, fitZoom, projectedExtent, viewDirection } from './view';

const small = () => new VoxelGrid([-4, -4, -4], [8, 8, 8]);

describe('VoxelGrid', () => {
  it('applies boxes, carves and tracks group and layer', () => {
    const g = small();
    g.apply([{ at: [0, 0, 0], size: [2, 2, 2], color: 0x808080 }], 3);
    g.apply([{ at: [1, 1, 1], carve: true }]);
    g.apply([{ at: [-1, 0, 0], color: 0xffaa00, glow: true }], 4);
    expect(g.count()).toBe(8);
    expect(g.has(1, 1, 1)).toBe(false);
    expect(g.groupAt(0, 0, 0)).toBe(3);
    expect(g.layerAt(-1, 0, 0)).toBe(LAYER_GLOW);
    expect(g.colorAt(-1, 0, 0)).toBe(0xffaa00);
  });

  it('treats outside cells as empty and rejects writes outside', () => {
    const g = small();
    expect(g.has(100, 0, 0)).toBe(false);
    expect(() => g.set(100, 0, 0, 0)).toThrow(RangeError);
  });

  it('jitter is deterministic', () => {
    const a = small();
    const b = small();
    const op = { at: [0, 0, 0] as const, size: [3, 1, 1] as const, color: 0x808080, jitter: 0.2 };
    a.apply([op]);
    b.apply([op]);
    expect(a.colorAt(2, 0, 0)).toBe(b.colorAt(2, 0, 0));
    expect(hash3(1, 2, 3)).toBe(hash3(1, 2, 3));
    expect(hash3(1, 2, 3)).toBeGreaterThanOrEqual(0);
    expect(hash3(1, 2, 3)).toBeLessThan(1);
  });

  it('shade scales and clamps channels', () => {
    expect(shade(0x804020, 2)).toBe(0xff8040);
    expect(shade(0x804020, 0)).toBe(0);
  });
});

describe('buildVoxelGeometry', () => {
  it('emits 6 faces for one voxel and culls shared faces', () => {
    const g = small();
    g.apply([{ at: [0, 0, 0], color: 0xffffff }]);
    expect(buildVoxelGeometry(g, 0, LAYER_SOLID).stats.faces).toBe(6);
    g.apply([{ at: [1, 0, 0], color: 0xffffff }]);
    const { geometry, stats } = buildVoxelGeometry(g, 0, LAYER_SOLID);
    expect(stats.faces).toBe(10);
    expect(stats.triangles).toBe(20);
    expect(geometry.getAttribute('position').count).toBe(40);
    expect(geometry.getAttribute('color').count).toBe(40);
    expect(geometry.getIndex()?.count).toBe(60);
  });

  it('drops faces pointing down and back when asked', () => {
    const g = small();
    g.apply([{ at: [0, 0, 0], color: 0xffffff }]);
    expect(
      buildVoxelGeometry(g, 0, LAYER_SOLID, { cullNegY: true, cullNegZ: true }).stats.faces,
    ).toBe(4);
  });

  it('meshes only the requested group and layer, but culls against all neighbours', () => {
    const g = small();
    g.apply([{ at: [0, 0, 0], color: 0xffffff }], 1);
    g.apply([{ at: [1, 0, 0], color: 0xffaa00, glow: true }], 2);
    expect(buildVoxelGeometry(g, 1, LAYER_SOLID).stats.faces).toBe(5);
    expect(buildVoxelGeometry(g, 2, LAYER_GLOW).stats.faces).toBe(5);
    expect(buildVoxelGeometry(g, 1, LAYER_GLOW).stats.faces).toBe(0);
  });

  it('bakes nearby lights brighter than ambient only', () => {
    const g = small();
    g.apply([{ at: [0, 0, 0], color: 0x808080 }]);
    const maxColor = (lights: Parameters<typeof buildVoxelGeometry>[3]) => {
      const c = buildVoxelGeometry(g, 0, LAYER_SOLID, lights).geometry.getAttribute('color');
      return Math.max(...Array.from(c.array as Float32Array));
    };
    const dark = maxColor({});
    const lit = maxColor({
      lights: [{ position: [0.5, 3, 0.5], color: [1, 0.7, 0.4], radius: 8, intensity: 2 }],
    });
    expect(lit).toBeGreaterThan(dark);
    expect(lit).toBeLessThanOrEqual(1);
  });

  it('darkens corners next to occluders (ambient occlusion)', () => {
    const g = small();
    g.apply([{ at: [-2, 0, -2], size: [5, 1, 5], color: 0xffffff }]);
    g.apply([{ at: [1, 1, 0], color: 0xffffff }]);
    const { geometry } = buildVoxelGeometry(g, 0, LAYER_SOLID);
    const colors = geometry.getAttribute('color');
    const positions = geometry.getAttribute('position');
    // Top-face vertices of the floor at the occluder's base are darker than an open corner.
    let occluded = 1;
    let open = 0;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) !== 1) continue;
      const x = positions.getX(i);
      const z = positions.getZ(i);
      if (x === 1 && z === 0) occluded = Math.min(occluded, colors.getX(i));
      if (x === -2 && z === 3) open = Math.max(open, colors.getX(i));
    }
    expect(occluded).toBeLessThan(open);
  });
});

describe('stations', () => {
  it('build every station kind inside its room', () => {
    for (const m of MEMBERS) {
      const s = buildStation(m.station);
      const g = new VoxelGrid([-1, -1, -1], [16, 11, 12]);
      expect(() => g.apply(s.ops)).not.toThrow();
      for (const p of [s.prop, s.figure, s.lantern]) {
        expect(p[0]).toBeGreaterThanOrEqual(0);
        expect(p[0]).toBeLessThanOrEqual(14);
        expect(p[1]).toBeGreaterThanOrEqual(0);
        expect(p[1]).toBeLessThanOrEqual(9);
        expect(p[2]).toBeGreaterThanOrEqual(0);
        expect(p[2]).toBeLessThanOrEqual(10);
      }
    }
  });

  it('council has 11 distinct seats', () => {
    const seats = buildStation('council').seats ?? [];
    expect(seats).toHaveLength(11);
    expect(new Set(seats.map((p) => p.join(','))).size).toBe(11);
  });
});

describe('hideout', () => {
  it('fits in the scene bounds with rooms that do not overlap', () => {
    const boxes = MEMBERS.map((m) => roomBox(m.slot));
    for (const [i, a] of boxes.entries()) {
      for (let k = 0; k < 3; k++) {
        expect(a.min[k]).toBeGreaterThanOrEqual(SCENE_BOUNDS.min[k] ?? 0);
        expect(a.max[k]).toBeLessThanOrEqual(SCENE_BOUNDS.max[k] ?? 0);
      }
      for (const b of boxes.slice(i + 1)) {
        const overlap = [0, 1, 2].every(
          (k) => (a.min[k] ?? 0) < (b.max[k] ?? 0) && (b.min[k] ?? 0) < (a.max[k] ?? 0),
        );
        expect(overlap).toBe(false);
      }
    }
  });

  it('keeps shell rock and roofs out of every room interior', () => {
    const { grid } = buildHideoutGrid();
    for (const m of MEMBERS) {
      const { min, max } = roomBox(m.slot);
      let shell = 0;
      for (let x = min[0]; x < max[0]; x++)
        for (let y = min[1]; y < max[1]; y++)
          for (let z = min[2]; z < max[2]; z++)
            if (grid.groupAt(x, y, z) === 0) shell += grid.has(x, y, z) ? 1 : 0;
      expect(shell, m.id).toBe(0);
    }
  });

  it('exports anchors inside each room for every member', () => {
    for (const id of MEMBER_IDS) {
      const a = ROOM_ANCHORS[id];
      for (const p of [a.figure, a.prop, a.light, a.center])
        for (let k = 0; k < 3; k++) {
          expect(p[k]).toBeGreaterThanOrEqual((a.box.min[k] ?? 0) - 1);
          expect(p[k]).toBeLessThanOrEqual(a.box.max[k] ?? 0);
        }
      expect(a.label[1]).toBeGreaterThan(a.box.max[1] - 0.01);
    }
    expect(ROOM_ANCHORS.elders.seats).toHaveLength(11);
  });

  it('puts a glowing lantern at every room light anchor', () => {
    const { grid } = buildHideoutGrid();
    for (const id of MEMBER_IDS) {
      const [x, y, z] = ROOM_ANCHORS[id].light.map(Math.floor) as [number, number, number];
      expect(grid.layerAt(x, y, z), id).toBe(LAYER_GLOW);
    }
  });

  it('builds 2 geometries per room plus the shell, within a sane triangle budget', () => {
    const built = buildHideout();
    expect(built.rooms).toHaveLength(13);
    expect(built.stats.geometries).toBe(28);
    expect(built.stats.triangles).toBeGreaterThan(5000);
    expect(built.stats.triangles).toBeLessThan(60000);
    built.dispose();
  });

  it('silk is one line geometry', () => {
    const silk = buildSilk();
    expect(silk.getAttribute('position').count % 2).toBe(0);
    expect(silk.getAttribute('position').count).toBeGreaterThan(100);
  });
});

describe('view maths', () => {
  it('view direction is a unit vector, looking from front-right and above', () => {
    const d = viewDirection(0.42, Math.PI / 2 - 0.4);
    expect(Math.hypot(...d)).toBeCloseTo(1);
    expect(d[0]).toBeGreaterThan(0);
    expect(d[1]).toBeGreaterThan(0);
    expect(d[2]).toBeGreaterThan(0);
  });

  it('a cube seen head-on projects to its face', () => {
    const box = { min: [0, 0, 0], max: [2, 2, 2] } as const;
    const [w, h] = projectedExtent(box, 0, Math.PI / 2);
    expect(w).toBeCloseTo(2);
    expect(h).toBeCloseTo(2);
  });

  it('fit zoom is limited by width on a portrait phone and by height on desktop', () => {
    const [w, h] = projectedExtent(VIEW_BOUNDS, 0.42, Math.PI / 2 - 0.4);
    const phone = fitZoom(VIEW_BOUNDS, 0.42, Math.PI / 2 - 0.4, 412, 839, 1);
    const desktop = fitZoom(VIEW_BOUNDS, 0.42, Math.PI / 2 - 0.4, 1280, 800, 1);
    expect(phone).toBeCloseTo(412 / w);
    expect(desktop).toBeCloseTo(800 / h);
  });

  it('clampInto keeps points inside a box', () => {
    const v = { x: 50, y: -3, z: 1 };
    expect(clampInto(v, { min: [0, 0, 0], max: [10, 10, 10] })).toBe(true);
    expect(v).toEqual({ x: 10, y: 0, z: 1 });
    expect(clampInto(v, { min: [0, 0, 0], max: [10, 10, 10] })).toBe(false);
  });
});
