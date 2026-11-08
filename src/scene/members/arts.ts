// Every member's figure, prop and work loop, in MEMBERS order (the index the
// cast shader uses for the per-member uniforms).

import { MEMBERS, type MemberId } from '../../config/members';
import { ROOM_ANCHORS, type RoomAnchors } from '../voxel/hideout';
import type { MemberArt } from './figure';
import { bonolenov } from './bonolenov';
import { chrollo } from './chrollo';
import { elders } from './elders';
import { feitan } from './feitan';
import { franklin } from './franklin';
import { kalluto } from './kalluto';
import { kortopi } from './kortopi';
import { machi } from './machi';
import { nobunaga } from './nobunaga';
import { pakunoda } from './pakunoda';
import { phinks } from './phinks';
import { shalnark } from './shalnark';
import { shizuku } from './shizuku';

const ART: { readonly [K in MemberId]: (a: RoomAnchors) => MemberArt } = {
  chrollo,
  elders,
  pakunoda,
  shalnark,
  kortopi,
  phinks,
  feitan,
  machi,
  nobunaga,
  franklin,
  shizuku,
  bonolenov,
  kalluto,
};

export function buildArts(): MemberArt[] {
  return MEMBERS.map((m) => ART[m.id](ROOM_ANCHORS[m.id]));
}
