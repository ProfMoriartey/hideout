import { Canvas } from '@react-three/fiber';
import { hideBootScreen } from './boot';
import { OverlayBoundary, SceneBoundary } from './boundaries';
import { MEMBER_BY_ID } from './config/members';
import { getFeedStore } from './feed/store';
import { CameraRig } from './scene/CameraRig';
import { Hideout } from './scene/Hideout';
import { Members } from './scene/members/Members';
import { RoomLights } from './scene/RoomLights';
import { Footer } from './ui/Footer';
import { MissionBanner } from './ui/MissionBanner';
import { SoundToggle } from './ui/SoundToggle';
import { Ticker } from './ui/Ticker';

// Composition root. Loaded lazily from main.tsx, so everything imported here
// (three, R3F, drei, scene and UI) is code-split from the entry chunk.
// Tickets 3-8 each add their component on the marked line; keep the slots.

getFeedStore().setNameOf((id) => MEMBER_BY_ID[id].name);

export default function App() {
  return (
    <>
      <SceneBoundary>
        <Canvas
          style={{ position: 'fixed', inset: 0 }}
          // Ticket 8 (performance) owns DPR and quality tiers; placeholder cap.
          dpr={[1, 1.5]}
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
          {/* [slot 8 Performance] <PerfMonitor /> */}
        </Canvas>
      </SceneBoundary>

      {/* DOM overlays, outside the canvas. Mount every overlay inside this
          boundary: one that throws disappears, the scene keeps running. */}
      <OverlayBoundary>
        {/* [slot 5 Panel] <RoomPanel /> */}
        {/* [slot 6 Global UI] Freshness is mounted inside Footer */}
        <MissionBanner />
        <Ticker />
        <Footer />
        <SoundToggle /> {/* [slot 7 Sound] */}
      </OverlayBoundary>
    </>
  );
}
