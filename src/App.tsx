import { Canvas } from '@react-three/fiber';
import { hideBootScreen } from './boot';
import { OverlayBoundary, SceneBoundary } from './boundaries';
import { CameraRig } from './scene/CameraRig';
import { Hideout } from './scene/Hideout';

// Composition root. Loaded lazily from main.tsx, so everything imported here
// (three, R3F, drei, scene and UI) is code-split from the entry chunk.
// Tickets 3-8 each add their component on the marked line; keep the slots.

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
          {/* [slot 5 Labels] <Labels /> */}
          {/* [slot 8 Performance] <PerfMonitor /> */}
        </Canvas>
      </SceneBoundary>

      {/* DOM overlays, outside the canvas. Mount every overlay inside this
          boundary: one that throws disappears, the scene keeps running. */}
      <OverlayBoundary>
        {/* [slot 5 Panel] <RoomPanel /> */}
        {/* [slot 6 Global UI] <MissionBanner /> <Ticker /> <Freshness /> <Footer /> */}
        {/* [slot 7 Sound] <SoundToggle /> */}
      </OverlayBoundary>
    </>
  );
}
