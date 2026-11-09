import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import { hideBootScreen } from './boot';
import { OverlayBoundary, SceneBoundary } from './boundaries';
import { MEMBER_BY_ID } from './config/members';
import { getFeedStore } from './feed/store';
import { PerfMonitor } from './perf/PerfMonitor';
import { DPR_MAX, deviceTier, useReducedMotion } from './perf/quality';
import { CameraRig } from './scene/CameraRig';
import { Hideout } from './scene/Hideout';
import { Labels } from './scene/Labels';
import { Members } from './scene/members/Members';
import { RoomLights } from './scene/RoomLights';
import { Footer } from './ui/Footer';
import { MissionBanner } from './ui/MissionBanner';
import { RoomPanel } from './ui/RoomPanel';
import { SoundToggle } from './ui/SoundToggle';
import { Ticker } from './ui/Ticker';

// Composition root. Loaded lazily from main.tsx, so everything imported here
// (three, R3F, drei, scene and UI) is code-split from the entry chunk.
// Tickets 3-8 each add their component on the marked line; keep the slots.

getFeedStore().setNameOf((id) => MEMBER_BY_ID[id].name);

export default function App() {
  // Changes at most twice (tier drops); reduced motion is the user's setting.
  const [tier, setTier] = useState(deviceTier);
  const reduced = useReducedMotion();
  return (
    <>
      <SceneBoundary>
        <Canvas
          style={{ position: 'fixed', inset: 0 }}
          // Tier cap: 1.5 on touch devices, 2 elsewhere, lower after PerfMonitor drops a tier.
          dpr={[1, DPR_MAX[tier]]}
          // Nothing animates under reduced motion; low tier is driven at LOW_FPS by PerfMonitor.
          frameloop={reduced || tier === 'low' ? 'demand' : 'always'}
          gl={{ antialias: false, powerPreference: 'high-performance' }}
          camera={{ position: [3, 3, 3], fov: 45 }}
          onCreated={() => requestAnimationFrame(() => hideBootScreen())}
        >
          <color attach="background" args={['#0b0a10']} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[4, 6, 3]} intensity={1.2} color="#ffd9a0" />

          {/* [slot 3 Structure] <Hideout /> and <CameraRig /> */}
          <Hideout />
          <CameraRig />
          {/* [slot 4 Members] <Members /> and <RoomLights /> */}
          <Members />
          <RoomLights />
          {/* [slot 5 Labels] <Labels /> */}
          <Labels />
          {/* [slot 8 Performance] <PerfMonitor /> */}
          <PerfMonitor tier={tier} reduced={reduced} onDrop={setTier} />
        </Canvas>
      </SceneBoundary>

      {/* DOM overlays, outside the canvas. Mount every overlay inside this
          boundary: one that throws disappears, the scene keeps running. */}
      <OverlayBoundary>
        {/* [slot 5 Panel] <RoomPanel /> */}
        <RoomPanel />
        {/* [slot 6 Global UI] Freshness is mounted inside Footer */}
        <MissionBanner />
        <Ticker />
        <Footer />
        {/* [slot 7 Sound] */}
        <SoundToggle />
      </OverlayBoundary>
    </>
  );
}
