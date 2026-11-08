// Room lighting by member state: watches each member's display state and, once
// per frame, steps the shared levels and tints that room's baked materials
// (dim when idle or stale, lit when working, a burst on done). No real lights.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { MEMBERS, type MemberId } from '../config/members';
import { useMember } from '../feed/useFeed';
import { levels, reducedMotion, stepLevels } from './members/levels';
import { getRoomMaterials } from './voxel/materials';

const rooms = MEMBERS.map((m) => getRoomMaterials(m.id));

/** Lantern and screen glow while idle (1 = as baked). */
const GLOW_IDLE = 0.3;

function Watch({ id, index }: { id: MemberId; index: number }) {
  const { display } = useMember(id);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    levels.display[index] = display;
    // On-demand rendering (reduced motion, low tier) needs a frame to show the new state.
    invalidate();
  }, [display, index, invalidate]);
  return null;
}

declare global {
  interface Window {
    /** Per-member levels for automated browsers (e2e asserts states without pixels). */
    __hideoutLevels?: typeof levels;
  }
}

export function RoomLights() {
  useEffect(() => {
    if (!import.meta.env.DEV && navigator.webdriver !== true) return;
    window.__hideoutLevels = levels;
    return () => {
      delete window.__hideoutLevels;
    };
  }, []);
  useFrame((_, dt) => {
    stepLevels(levels, dt, reducedMotion());
    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      if (!room) continue;
      const work = levels.work[i] ?? 0;
      const cel = levels.celebrate[i] ?? 0;
      room.solid.color.setScalar(levels.light[i] ?? 1);
      room.glow.color.setScalar(GLOW_IDLE + (1 - GLOW_IDLE) * work + 1.2 * cel);
    }
  });
  return (
    <>
      {MEMBERS.map((m, i) => (
        <Watch key={m.id} id={m.id} index={i} />
      ))}
    </>
  );
}
