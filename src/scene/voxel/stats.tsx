// Draw-call and triangle counter for dev builds and automated browsers.
// Exposes `window.__hideoutStats`, refreshed every frame without allocating.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type { MapControls as MapControlsImpl } from 'three-stdlib';

export type HideoutStats = {
  /** Draw calls in the last rendered frame. */
  calls: number;
  /** Triangles in the last rendered frame. */
  triangles: number;
  /** Rendered frames so far. */
  frames: number;
  /** Triangles in the static voxel geometry. */
  voxelTriangles: number;
  /** Camera state, for the gesture and limit tests. */
  zoom: number;
  minZoom: number;
  maxZoom: number;
  azimuth: number;
  polar: number;
};

declare global {
  interface Window {
    __hideoutStats?: HideoutStats;
  }
}

/** Dev server, or a browser driven by automation (Playwright sets navigator.webdriver). */
function statsEnabled(): boolean {
  return import.meta.env.DEV || (typeof navigator !== 'undefined' && navigator.webdriver === true);
}

function StatsProbe({ voxelTriangles }: { voxelTriangles: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    window.__hideoutStats = {
      calls: 0,
      triangles: 0,
      frames: 0,
      voxelTriangles,
      zoom: 0,
      minZoom: 0,
      maxZoom: 0,
      azimuth: 0,
      polar: 0,
    };
    return () => {
      delete window.__hideoutStats;
    };
  }, [voxelTriangles]);
  // useFrame runs before this frame's render; gl.info still holds the last frame.
  useFrame(({ camera, controls }) => {
    const s = window.__hideoutStats;
    if (!s) return;
    s.zoom = camera.zoom;
    const c = controls as MapControlsImpl | null;
    if (c) {
      s.minZoom = c.minZoom;
      s.maxZoom = c.maxZoom;
      s.azimuth = c.getAzimuthalAngle();
      s.polar = c.getPolarAngle();
    }
    s.calls = gl.info.render.calls;
    s.triangles = gl.info.render.triangles;
    s.frames = gl.info.render.frame;
  });
  return null;
}

export function HideoutStatsProbe({ voxelTriangles }: { voxelTriangles: number }) {
  return statsEnabled() ? <StatsProbe voxelTriangles={voxelTriangles} /> : null;
}
