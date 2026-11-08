// Shared builder for the member figures and props. Each member file describes
// its figure, prop and work loop as small box lists; everything is merged into
// ONE geometry for all 13 rooms and animated in the vertex shader (Members.tsx)
// from per-member uniforms, so the whole cast is a single draw call.
//
// Figure-local units are "figure voxels" (FV = 0.25 world units): x right,
// y up from the feet (or the seat surface), z towards the figure's front.

import { BufferAttribute, BufferGeometry } from 'three';
import type { Vec3 } from '../voxel/grid';
import type { RoomAnchors } from '../voxel/hideout';

/** World units per figure voxel. */
export const FV = 0.25;

export type Box = {
  /** Min corner, figure voxels. */
  readonly at: Vec3;
  readonly size: Vec3;
  readonly color: number;
};

/**
 * Animation of one part around its pivot. The idle pose is `rest`, the working
 * pose `offset`, plus `amp * sin(t * speed + phase)` while working. Angles in
 * radians around `axis`; with `slide` the part moves along `axis` instead (FV).
 */
export type Motion = {
  readonly axis: Vec3;
  readonly amp?: number;
  readonly speed?: number;
  readonly phase?: number;
  readonly rest?: number;
  readonly offset?: number;
  /** Encoded for the shader as a negative speed, so speed is always taken as positive. */
  readonly slide?: boolean;
};

/** 0: lit with the room. 1: glows while working. 2: always full (the stale "?"). */
export type Glow = 0 | 1 | 2;

export type Part = {
  readonly boxes: readonly Box[];
  /** Figure voxels. */
  readonly pivot?: Vec3;
  readonly motion?: Motion;
  readonly glow?: Glow;
  /** Body parts breathe and hop; props do not. */
  readonly body?: boolean;
  /** Only shown while the member is stale (collapses to the pivot otherwise). */
  readonly staleOnly?: boolean;
};

/** A group of parts placed in the world: feet (or seat) at `at`, facing `yaw` (0 = +z). */
export type Placed = { readonly at: Vec3; readonly yaw?: number; readonly parts: readonly Part[] };

export type MemberArt = {
  readonly placed: readonly Placed[];
  /** World position the working particles rise from. */
  readonly sparks: Vec3;
  readonly sparkColor: number;
};

export const SKIN = 0xd9a77f;

export function box(at: Vec3, size: Vec3, color: number): Box {
  return { at, size, color };
}

/** Rotates figure-local `p` by yaw around y. */
function yawed(p: Vec3, yaw: number): Vec3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}

// ---------------------------------------------------------------- humanoid

export type HairStyle =
  'slick' | 'short' | 'spiky' | 'ponytail' | 'topknot' | 'bob' | 'buzz' | 'shaggy' | 'wrap';

export type Arm = {
  readonly motion?: Motion;
  /** Boxes held in the hand; `at` relative to the bottom centre of the hand. */
  readonly holds?: readonly Box[];
  /** Separate glowing held part (needle thread, lantern), same motion as the arm. */
  readonly glows?: readonly Box[];
};

export type Human = {
  /** Leg length (ignored when sitting), torso height and width, in FV. */
  readonly legs: number;
  readonly torso: number;
  readonly width: number;
  readonly hair: HairStyle;
  readonly hairColor: number;
  readonly top: number;
  readonly bottom: number;
  readonly skin?: number;
  readonly sit?: boolean;
  /** Head motion while working (default: still). Idle always slumps the head. */
  readonly head?: Motion;
  readonly left?: Arm;
  readonly right?: Arm;
  /** Static extras on the body (collars, coats, belts, sheaths). */
  readonly extras?: readonly Box[];
};

const X: Vec3 = [1, 0, 0];
/** Idle head slump (asleep), radians forward. */
const SLUMP = 0.42;

function hairBoxes(style: HairStyle, top: number, c: number): Box[] {
  const cap = (y0: number) => box([-2.25, top + y0, -2.25], [4.5, 4.5 - y0, 4.5], c);
  const back = (y0: number) => box([-2.25, top + y0, -2.25], [4.5, 4 - y0, 0.75], c);
  switch (style) {
    case 'slick':
      return [cap(3.25), back(1), box([-2, top + 3.5, -2.75], [4, 1, 1], c)];
    case 'short':
      return [cap(3.25), back(2)];
    case 'spiky':
      return [
        cap(3),
        back(1.5),
        box([-1.75, top + 4.5, -1], [1, 1.25, 1], c),
        box([-0.25, top + 4.5, -1.75], [1, 1.5, 1], c),
        box([1, top + 4.5, -0.5], [1, 1, 1], c),
        box([-0.75, top + 4.5, 0.75], [1, 1, 1], c),
        box([-2.5, top + 2.5, -1], [0.5, 1.5, 1.5], c),
        box([2, top + 2.5, -1], [0.5, 1.5, 1.5], c),
      ];
    case 'ponytail':
      return [
        cap(3.25),
        back(1.5),
        box([-0.75, top + 4.25, -2.5], [1.5, 1.25, 1.5], c),
        box([-0.6, top + 0.75, -3.5], [1.2, 4.25, 1.25], c),
      ];
    case 'topknot':
      return [cap(3.5), back(2), box([-0.6, top + 4.5, -1.5], [1.2, 1.25, 2.5], c)];
    case 'bob':
      return [
        cap(3),
        back(0.25),
        box([-2.5, top + 0.5, -2.25], [0.5, 4, 3.5], c),
        box([2, top + 0.5, -2.25], [0.5, 4, 3.5], c),
        box([-2.25, top + 3, 2], [4.5, 0.75, 0.4], c),
      ];
    case 'buzz':
      return [box([-2.1, top + 3.6, -2.1], [4.2, 0.6, 4.2], c), back(2.5)];
    case 'shaggy':
      return [
        cap(3),
        back(1),
        box([-2.25, top + 2.5, 2], [1.25, 0.75, 0.5], c),
        box([0.25, top + 2.25, 2], [1.5, 1, 0.5], c),
        box([-2.5, top + 1.5, -1.5], [0.5, 2.5, 2.5], c),
        box([2, top + 1.5, -1.5], [0.5, 2.5, 2.5], c),
      ];
    case 'wrap':
      // Bandaged head: same tone as the head, with darker bands.
      return [
        box([-2.1, top + 1.2, -2.1], [4.2, 0.4, 4.2], c),
        box([-2.1, top + 2.8, -2.1], [4.2, 0.4, 4.2], c),
      ];
    default: {
      const never: never = style;
      throw new Error(`unknown hair ${String(never)}`);
    }
  }
}

/** A chunky humanoid: body (with legs), head with hair, and two arms on shoulder pivots. */
export function humanoid(h: Human): Part[] {
  const skin = h.skin ?? SKIN;
  const hw = h.width / 2;
  const base = h.sit ? 0.5 : h.legs;
  const top = base + h.torso;
  const body: Box[] = [box([-hw, base, -1.25], [h.width, h.torso, 2.5], h.top)];
  const legW = hw - 0.25;
  if (h.sit) {
    body.push(box([-hw, 0, -1.25], [h.width, 1.5, 4.5], h.bottom));
    body.push(box([-hw, -3.5, 2], [legW, 3.5, 1.25], h.bottom));
    body.push(box([0.25, -3.5, 2], [legW, 3.5, 1.25], h.bottom));
    body.push(box([-hw, -4, 1.75], [legW, 0.5, 2], 0x1c1a1e));
    body.push(box([0.25, -4, 1.75], [legW, 0.5, 2], 0x1c1a1e));
  } else {
    body.push(box([-hw, 0.6, -1], [legW, h.legs - 0.6, 2], h.bottom));
    body.push(box([0.25, 0.6, -1], [legW, h.legs - 0.6, 2], h.bottom));
    body.push(box([-hw, 0, -1], [legW, 0.6, 2.4], 0x1c1a1e));
    body.push(box([0.25, 0, -1], [legW, 0.6, 2.4], 0x1c1a1e));
  }
  body.push(...(h.extras ?? []));
  const neck: Vec3 = [0, top, 0];
  const head: Part = {
    body: true,
    pivot: neck,
    motion: { axis: X, rest: SLUMP, ...h.head },
    boxes: [box([-2, top, -2], [4, 4, 4], skin), ...hairBoxes(h.hair, top, h.hairColor)],
  };
  const arm = (side: -1 | 1, a: Arm | undefined): Part[] => {
    const x = side * (hw + 0.6);
    const pivot: Vec3 = [x, top - 0.5, 0];
    const hand = top - 0.5 - h.torso;
    const motion = { axis: X, rest: 0.08, ...a?.motion };
    const parts: Part[] = [
      {
        body: true,
        pivot,
        motion,
        boxes: [
          box([x - 0.6, hand + 1, -0.7], [1.2, h.torso - 0.5, 1.4], h.top),
          box([x - 0.55, hand, -0.6], [1.1, 1, 1.2], skin),
          ...(a?.holds ?? []).map((b) =>
            box([b.at[0] + x, b.at[1] + hand, b.at[2]], b.size, b.color),
          ),
        ],
      },
    ];
    if (a?.glows?.length)
      parts.push({
        glow: 1,
        body: true,
        pivot,
        motion,
        boxes: a.glows.map((b) => box([b.at[0] + x, b.at[1] + hand, b.at[2]], b.size, b.color)),
      });
    return parts;
  };
  return [{ body: true, boxes: body }, head, ...arm(-1, h.left), ...arm(1, h.right)];
}

/** Height of a humanoid's head top above its origin, in FV (for the "?"). */
export function headTop(h: Pick<Human, 'legs' | 'torso' | 'sit'>): number {
  return (h.sit ? 0.5 : h.legs) + h.torso + 4.5;
}

const QUESTION = ['###', '..#', '.##', '.#.', '...', '.#.'];

/** A small glowing "?" whose bottom centre is at `at` (FV), shown only while stale. */
export function questionMark(at: Vec3): Part {
  const boxes: Box[] = [];
  QUESTION.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === '#')
        boxes.push(
          box([at[0] + (c - 1.5) * 0.9, at[1] + (5 - r) * 0.9, at[2]], [0.9, 0.9, 0.9], 0xfff2b0),
        );
    }),
  );
  return { glow: 2, staleOnly: true, boxes };
}

// ---------------------------------------------------------------- meshing

/** Face brightness by world normal direction (+x -x +y -y +z -z), as in the room mesher. */
const SHADE = [0.78, 0.66, 1.0, 0.5, 0.88, 0.6] as const;
const FACES = [
  {
    n: [1, 0, 0],
    c: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    c: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  {
    n: [0, 1, 0],
    c: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    n: [0, -1, 0],
    c: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    n: [0, 0, 1],
    c: [
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
      [0, 0, 1],
    ],
  },
  {
    n: [0, 0, -1],
    c: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  },
] as const;

function srgbToLinear(byte: number): number {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function shadeOf(n: Vec3): number {
  // Weighted by how much the rotated normal points along each axis.
  let s = 0;
  s += Math.max(0, n[0]) * SHADE[0] + Math.max(0, -n[0]) * SHADE[1];
  s += Math.max(0, n[1]) * SHADE[2] + Math.max(0, -n[1]) * SHADE[3];
  s += Math.max(0, n[2]) * SHADE[4] + Math.max(0, -n[2]) * SHADE[5];
  return s / (Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]));
}

export type CastStats = { boxes: number; triangles: number; vertices: number };

/**
 * Merges every member's placed parts into one geometry. Attributes beside
 * position/color: `pivot` (world), `axis` (world axis, w = working offset),
 * `motion` (amp, speed with sign = slide, phase, rest), `info` (member index,
 * breathing weight, glow mode, kind: 0 prop, 1 body, 2 stale-only).
 */
export function buildCast(arts: readonly MemberArt[]): {
  geometry: BufferGeometry;
  stats: CastStats;
} {
  const pos: number[] = [];
  const col: number[] = [];
  const piv: number[] = [];
  const axs: number[] = [];
  const mot: number[] = [];
  const inf: number[] = [];
  const idx: number[] = [];
  let boxes = 0;
  arts.forEach((art, member) => {
    for (const placed of art.placed) {
      const yaw = placed.yaw ?? 0;
      const world = (p: Vec3): Vec3 => {
        const r = yawed(p, yaw);
        return [placed.at[0] + r[0] * FV, placed.at[1] + r[1] * FV, placed.at[2] + r[2] * FV];
      };
      for (const part of placed.parts) {
        const pivot = world(part.pivot ?? [0, 0, 0]);
        const m = part.motion;
        const axis = m ? yawed(m.axis, yaw) : ([1, 0, 0] as Vec3);
        const speed = m?.speed ?? 0;
        const motion = [
          m?.slide ? (m.amp ?? 0) * FV : (m?.amp ?? 0),
          m?.slide ? -Math.max(Math.abs(speed), 1e-3) : Math.abs(speed),
          m?.phase ?? 0,
          m?.slide ? (m.rest ?? 0) * FV : (m?.rest ?? 0),
        ];
        const offset = m?.slide ? (m.offset ?? 0) * FV : (m?.offset ?? 0);
        for (const b of part.boxes) {
          boxes++;
          const lin = [
            srgbToLinear((b.color >> 16) & 255),
            srgbToLinear((b.color >> 8) & 255),
            srgbToLinear(b.color & 255),
          ];
          for (const face of FACES) {
            const n = yawed(face.n, yaw);
            const k = shadeOf(n);
            const first = pos.length / 3;
            for (const c of face.c) {
              const local: Vec3 = [
                b.at[0] + c[0] * b.size[0],
                b.at[1] + c[1] * b.size[1],
                b.at[2] + c[2] * b.size[2],
              ];
              const w = world(local);
              pos.push(w[0], w[1], w[2]);
              col.push((lin[0] ?? 0) * k, (lin[1] ?? 0) * k, (lin[2] ?? 0) * k);
              piv.push(pivot[0], pivot[1], pivot[2]);
              axs.push(axis[0], axis[1], axis[2], offset);
              mot.push(motion[0] ?? 0, motion[1] ?? 0, motion[2] ?? 0, motion[3] ?? 0);
              // Breathing lifts each vertex in proportion to its height above the feet.
              const breath = part.body ? Math.max(0, local[1]) * FV * 0.05 : 0;
              inf.push(member, breath, part.glow ?? 0, part.staleOnly ? 2 : part.body ? 1 : 0);
            }
            idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
          }
        }
      }
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  geometry.setAttribute('pivot', new BufferAttribute(new Float32Array(piv), 3));
  geometry.setAttribute('axis', new BufferAttribute(new Float32Array(axs), 4));
  geometry.setAttribute('motion', new BufferAttribute(new Float32Array(mot), 4));
  geometry.setAttribute('info', new BufferAttribute(new Float32Array(inf), 4));
  const vertices = pos.length / 3;
  geometry.setIndex(
    new BufferAttribute(vertices > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1),
  );
  geometry.computeBoundingSphere();
  return { geometry, stats: { boxes, triangles: idx.length / 3, vertices } };
}

/** Particles per member (rising while working, bursting on done). */
export const SPARKS_PER_MEMBER = 8;

/** One point per spark: `seed` = (member, phase, dx, dz), colour = member's spark colour. */
export function buildSparks(arts: readonly MemberArt[]): BufferGeometry {
  const n = arts.length * SPARKS_PER_MEMBER;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const seed = new Float32Array(n * 4);
  arts.forEach((art, member) => {
    const c = art.sparkColor;
    for (let k = 0; k < SPARKS_PER_MEMBER; k++) {
      const i = member * SPARKS_PER_MEMBER + k;
      const a = (k / SPARKS_PER_MEMBER) * Math.PI * 2 + member;
      pos.set(art.sparks, i * 3);
      col.set(
        [srgbToLinear((c >> 16) & 255), srgbToLinear((c >> 8) & 255), srgbToLinear(c & 255)],
        i * 3,
      );
      seed.set([member, k / SPARKS_PER_MEMBER, Math.cos(a), Math.sin(a)], i * 4);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setAttribute('seed', new BufferAttribute(seed, 4));
  return g;
}

// ---------------------------------------------------------------- placing

/** Room-local voxel coordinates (as in stations.ts) to world. */
export function inRoom(a: RoomAnchors, p: Vec3): Vec3 {
  return [a.box.min[0] + p[0], a.box.min[1] + p[1], a.box.min[2] + p[2]];
}

/** The stale "?" floating `height` FV above `at`, always facing the camera side. */
export function markAbove(at: Vec3, height: number): Placed {
  return { at: [at[0], at[1] + height * FV, at[2]], parts: [questionMark([0, 0, 0])] };
}
