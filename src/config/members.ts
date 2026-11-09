// The Troupe roster: the single source of truth for ids, names, role copy,
// room slots, homage colours and prop names. Tickets 4-6 read from here.
//
// Colours are broad homage palettes only (no outfits, faces or emblems).

/** Room grid position. `col` 0..2 from the left, `floor` 0 is the bottom. */
export type RoomSlot = { readonly col: number; readonly floor: number };

/** Broad colour scheme as hex numbers (sRGB). */
export type ColorScheme = {
  /** Main tone (walls, figure body). */
  readonly primary: number;
  /** Second tone (trim, hair). */
  readonly secondary: number;
  /** Lantern / glow accent. */
  readonly accent: number;
};

/** Which fixed furniture the structure builds in the room (props come from ticket 4). */
export type StationKind =
  | 'throne'
  | 'council'
  | 'mapTable'
  | 'drafting'
  | 'screens'
  | 'forge'
  | 'testChamber'
  | 'sewing'
  | 'guardPost'
  | 'machinery'
  | 'archive'
  | 'drumHall'
  | 'paperWorkshop';

export type MemberConfig = {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly plaque: string;
  /** Short description of the room, for alt text and the room panel. */
  readonly room: string;
  /** Role prop that ticket 4 builds. */
  readonly prop: string;
  readonly station: StationKind;
  readonly slot: RoomSlot;
  readonly colors: ColorScheme;
};

export const MEMBERS = [
  {
    id: 'chrollo',
    name: 'Chrollo',
    role: 'Coordinator',
    plaque: 'planning, tracking, scheduling, briefing the team',
    room: 'throne and reading room with a big book',
    prop: 'the big book',
    station: 'throne',
    slot: { col: 1, floor: 0 },
    colors: { primary: 0x2a2236, secondary: 0xe6e0d2, accent: 0xd9a840 },
  },
  {
    id: 'elders',
    name: 'The Elders',
    role: 'Founder council',
    plaque: 'strategy, money, pricing, brand, marketing, launch',
    room: 'round table, 11 seats',
    prop: 'council round table',
    station: 'council',
    slot: { col: 0, floor: 0 },
    colors: { primary: 0x3b2e4d, secondary: 0xb08d57, accent: 0xf0c674 },
  },
  {
    id: 'franklin',
    name: 'Franklin',
    role: 'DevOps',
    plaque: 'deployment pipelines, cloud, monitoring',
    room: 'pipes and machinery',
    prop: 'wrench and pipes',
    station: 'machinery',
    slot: { col: 2, floor: 4 },
    colors: { primary: 0x4b5a3c, secondary: 0x8a6a4a, accent: 0xffc861 },
  },
  {
    id: 'phinks',
    name: 'Phinks',
    role: 'Back-end engineer',
    plaque: 'databases, servers, APIs',
    room: 'forge and engine room',
    prop: 'hammer at the forge',
    station: 'forge',
    slot: { col: 0, floor: 1 },
    colors: { primary: 0x2f3d7a, secondary: 0xd9c27a, accent: 0xff7a2e },
  },
  {
    id: 'feitan',
    name: 'Feitan',
    role: 'QA tester',
    plaque: 'browser testing, test-first, breaking things',
    room: 'test chamber with targets',
    prop: 'test targets',
    station: 'testChamber',
    slot: { col: 1, floor: 1 },
    colors: { primary: 0x1c1c26, secondary: 0x3d3d55, accent: 0xff4a4a },
  },
  {
    id: 'bonolenov',
    name: 'Bonolenov',
    role: 'AI and data',
    plaque: 'AI assistants, data pipelines, search',
    room: 'drum room and data hall',
    prop: 'drums',
    station: 'drumHall',
    slot: { col: 2, floor: 1 },
    colors: { primary: 0xc4ab85, secondary: 0x6b4a2e, accent: 0x7affc8 },
  },
  {
    id: 'kortopi',
    name: 'Kortopi',
    role: 'Front-end engineer',
    plaque: 'web apps, interfaces, mobile apps',
    room: 'workshop full of screens',
    prop: 'floating screens',
    station: 'screens',
    slot: { col: 0, floor: 2 },
    colors: { primary: 0x8e8e96, secondary: 0x55555e, accent: 0x66e0ff },
  },
  {
    id: 'shalnark',
    name: 'Shalnark',
    role: 'Architect',
    plaque: 'system design, APIs, code structure',
    room: 'drafting table, antenna',
    prop: 'antenna and blueprint',
    station: 'drafting',
    slot: { col: 1, floor: 2 },
    colors: { primary: 0x4f7d39, secondary: 0xe3cf7a, accent: 0x5cc8ff },
  },
  {
    id: 'machi',
    name: 'Machi',
    role: 'Code reviewer',
    plaque: 'code review, debugging, bug fixing',
    room: 'sewing table with threads',
    prop: 'needle and glowing thread',
    station: 'sewing',
    slot: { col: 2, floor: 2 },
    colors: { primary: 0xc96f93, secondary: 0x46679c, accent: 0xbfe6ff },
  },
  {
    id: 'pakunoda',
    name: 'Pakunoda',
    role: 'Planner',
    plaque: 'questions, specs, tickets, pre-mortems',
    room: 'map table, pinned notes',
    prop: 'notebook',
    station: 'mapTable',
    slot: { col: 0, floor: 3 },
    colors: { primary: 0x2f3b5c, secondary: 0xd9c9a3, accent: 0xffd27a },
  },
  {
    id: 'kalluto',
    name: 'Kalluto',
    role: 'Platform specialist',
    plaque: 'online stores, websites, CLIs, games',
    room: 'paper workshop',
    prop: 'paper sheets',
    station: 'paperWorkshop',
    slot: { col: 1, floor: 3 },
    colors: { primary: 0x6e2846, secondary: 0xece4d4, accent: 0xff9ec4 },
  },
  {
    id: 'shizuku',
    name: 'Shizuku',
    role: 'Cleanup',
    plaque: 'refactors, old code, documentation',
    room: 'archive with a vacuum',
    prop: 'vacuum',
    station: 'archive',
    slot: { col: 2, floor: 3 },
    colors: { primary: 0x25253a, secondary: 0xb6c4d8, accent: 0x9ad0ff },
  },
  {
    id: 'nobunaga',
    name: 'Nobunaga',
    role: 'Security guard',
    plaque: 'security review, safe code',
    room: 'guard post with lantern',
    prop: 'lantern at the guard post',
    station: 'guardPost',
    slot: { col: 1, floor: 4 },
    colors: { primary: 0x3d302a, secondary: 0xd9d0c0, accent: 0xffb347 },
  },
] as const satisfies readonly MemberConfig[];

export type Member = (typeof MEMBERS)[number];
export type MemberId = Member['id'];

export const MEMBER_IDS: readonly MemberId[] = MEMBERS.map((m) => m.id);

export const MEMBER_BY_ID = Object.fromEntries(MEMBERS.map((m) => [m.id, m])) as {
  readonly [K in MemberId]: Extract<Member, { id: K }>;
};

export function isMemberId(value: unknown): value is MemberId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MEMBER_BY_ID, value);
}
