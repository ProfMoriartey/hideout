// The hideout structure: rock shell, floors and one empty station per member.
// Geometry is built once from the voxel description and baked with lantern
// light; the whole structure is 2 + 13 * 2 + 1 = 29 draw calls.

import { useEffect, useMemo } from 'react';
import { buildHideout } from './voxel/hideout';
import { getRoomMaterials, shellMaterials } from './voxel/materials';
import { buildSilk } from './voxel/silk';
import { HideoutStatsProbe } from './voxel/stats';

export function Hideout() {
  const built = useMemo(() => buildHideout(), []);
  const silk = useMemo(() => buildSilk(), []);
  useEffect(
    () => () => {
      built.dispose();
      silk.dispose();
    },
    [built, silk],
  );

  return (
    <group name="hideout">
      <mesh
        name="shell"
        geometry={built.shell.solid}
        material={shellMaterials.solid}
        matrixAutoUpdate={false}
      />
      <mesh
        name="shell-glow"
        geometry={built.shell.glow}
        material={shellMaterials.glow}
        matrixAutoUpdate={false}
      />
      {built.rooms.map((room) => {
        const m = getRoomMaterials(room.id);
        return (
          <group key={room.id} name={`room-${room.id}`}>
            <mesh geometry={room.solid} material={m.solid} matrixAutoUpdate={false} />
            <mesh geometry={room.glow} material={m.glow} matrixAutoUpdate={false} />
          </group>
        );
      })}
      <lineSegments
        name="silk"
        geometry={silk}
        material={shellMaterials.silk}
        matrixAutoUpdate={false}
      />
      <HideoutStatsProbe voxelTriangles={built.stats.triangles} />
    </group>
  );
}
