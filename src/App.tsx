import { Canvas } from '@react-three/fiber';
import { hideBootScreen } from './boot';

// Composition root. Loaded lazily from main.tsx, so everything imported here
// (three, R3F, drei, scene and UI) is code-split from the entry chunk.
// Tickets 3-8 each add their component on the marked line; keep the slots.

/** Placeholder voxel: one lantern-lit cube. Ticket 3 replaces it with <Hideout />. */
function PlaceholderVoxel() {
  return (
    <mesh rotation={[0.5, 0.75, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#6b4a2e" emissive="#ff9a3c" emissiveIntensity={0.25} />
    </mesh>
  );
}

export default function App() {
  return (
    <>
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
        <PlaceholderVoxel />
        {/* [slot 4 Members] <Members /> and <RoomLights /> */}
        {/* [slot 5 Labels] <Labels /> */}
        {/* [slot 8 Performance] <PerfMonitor /> */}
      </Canvas>

      {/* DOM overlays, outside the canvas: */}
      {/* [slot 5 Panel] <RoomPanel /> */}
      {/* [slot 6 Global UI] <MissionBanner /> <Ticker /> <Freshness /> <Footer /> */}
      {/* [slot 7 Sound] <SoundToggle /> */}
    </>
  );
}
