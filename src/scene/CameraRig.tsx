// Isometric orthographic camera with clamped rotate, zoom and pan.
// Mouse: left drag pans, right drag rotates, wheel zooms.
// Touch: one finger pans, two fingers pinch-zoom and rotate.

import { MapControls, OrthographicCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Vector3, type OrthographicCamera as OrthoCam } from 'three';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import type { MemberId } from '../config/members';
import type { Vec3 } from './voxel/grid';
import { ROOM_ANCHORS } from './voxel/hideout';
import { SCENE_BOUNDS, VIEW_BOUNDS, boxCenter, type Box } from './voxel/layout';
import { clampInto, fitZoom, viewDirection } from './voxel/view';

/** Default view: looking from front-right, slightly above. */
export const DEFAULT_AZIMUTH = 0.42;
export const DEFAULT_POLAR = Math.PI / 2 - 0.4;
const AZIMUTH_RANGE = 0.55;
const POLAR_MIN = Math.PI / 2 - 0.85;
const POLAR_MAX = Math.PI / 2 - 0.12;
const DISTANCE = 120;

/** Pan stays within the structure, with a little slack. */
const PAN_BOUNDS: Box = {
  min: [SCENE_BOUNDS.min[0] + 4, SCENE_BOUNDS.min[1] + 2, 0],
  max: [SCENE_BOUNDS.max[0] - 4, SCENE_BOUNDS.max[1] - 4, 12],
};

type Goal = { target: Vector3; zoom: number };
type RigApi = { focus(target: Vec3, box: Box): void; reset(): void };

let rig: RigApi | null = null;

/** Moves the camera to a member's room (for the tap panel). No-op before the rig mounts. */
// eslint-disable-next-line react-refresh/only-export-components
export function focusRoom(id: MemberId): void {
  const a = ROOM_ANCHORS[id];
  rig?.focus(a.center, a.box);
}

/** Returns to the default whole-hideout view. */
// eslint-disable-next-line react-refresh/only-export-components
export function resetView(): void {
  rig?.reset();
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function CameraRig() {
  const camera = useRef<OrthoCam>(null);
  const controls = useRef<MapControlsImpl>(null);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const invalidate = useThree((s) => s.invalidate);
  // Both change once drei's makeDefault swaps them in; re-place the view then.
  const activeCamera = useThree((s) => s.camera);
  const activeControls = useThree((s) => s.controls);
  const goal = useRef<Goal | null>(null);
  const touched = useRef(false);
  const scratch = useRef({ delta: new Vector3(), next: new Vector3() });
  const home = useRef({ target: new Vector3(...boxCenter(VIEW_BOUNDS)), zoom: 1 });

  const place = useCallback((target: Vector3, zoom: number) => {
    const cam = camera.current;
    const ctl = controls.current;
    if (!cam || !ctl) return;
    const d = viewDirection(DEFAULT_AZIMUTH, DEFAULT_POLAR);
    ctl.target.copy(target);
    cam.position.set(
      target.x + d[0] * DISTANCE,
      target.y + d[1] * DISTANCE,
      target.z + d[2] * DISTANCE,
    );
    cam.zoom = zoom;
    cam.updateProjectionMatrix();
    ctl.update();
  }, []);

  // Fit the whole hideout whenever the viewport changes, until the user moves.
  const fit = useMemo(
    () => fitZoom(VIEW_BOUNDS, DEFAULT_AZIMUTH, DEFAULT_POLAR, width, height),
    [width, height],
  );
  useLayoutEffect(() => {
    home.current.zoom = fit;
    if (!touched.current) place(home.current.target, fit);
  }, [fit, place, activeCamera, activeControls]);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    const go = (target: Vec3 | Vector3, zoom: number) => {
      const t = Array.isArray(target)
        ? new Vector3(...(target as Vec3))
        : (target as Vector3).clone();
      const g = { target: t, zoom };
      if (reduced) {
        const cam = camera.current;
        const ctl = controls.current;
        if (!cam || !ctl) return;
        const delta = t.clone().sub(ctl.target);
        ctl.target.add(delta);
        cam.position.add(delta);
        cam.zoom = zoom;
        cam.updateProjectionMatrix();
        ctl.update();
      } else goal.current = g;
      invalidate();
    };
    rig = {
      focus(target, box) {
        touched.current = true;
        const zoom = fitZoom(box, DEFAULT_AZIMUTH, DEFAULT_POLAR, width, height, 0.85);
        const max = controls.current?.maxZoom ?? zoom;
        go(target, Math.min(zoom, max));
      },
      reset() {
        touched.current = false;
        go(home.current.target, home.current.zoom);
      },
    };
    return () => {
      rig = null;
    };
  }, [width, height, invalidate]);

  // Glide towards a focus goal; user input cancels it. No allocation per frame.
  useFrame((_, dt) => {
    const g = goal.current;
    const cam = camera.current;
    const ctl = controls.current;
    if (!g || !cam || !ctl) return;
    const k = 1 - Math.exp(-dt * 6);
    const { delta, next } = scratch.current;
    next.copy(ctl.target).lerp(g.target, k);
    delta.subVectors(next, ctl.target);
    ctl.target.copy(next);
    cam.position.add(delta);
    cam.zoom += (g.zoom - cam.zoom) * k;
    cam.updateProjectionMatrix();
    ctl.update();
    if (ctl.target.distanceToSquared(g.target) < 1e-4 && Math.abs(cam.zoom - g.zoom) < 1e-3)
      goal.current = null;
  });

  const onStart = useCallback(() => {
    touched.current = true;
    goal.current = null;
  }, []);

  // Keep the pan target inside the structure; move the camera along with it.
  const onChange = useCallback(() => {
    const cam = camera.current;
    const ctl = controls.current;
    if (!cam || !ctl) return;
    const { delta, next } = scratch.current;
    next.copy(ctl.target);
    if (clampInto(next, PAN_BOUNDS)) {
      delta.subVectors(next, ctl.target);
      ctl.target.copy(next);
      cam.position.add(delta);
    }
  }, []);

  return (
    <>
      <OrthographicCamera ref={camera} makeDefault near={1} far={DISTANCE * 3} />
      <MapControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        screenSpacePanning
        minZoom={fit * 0.75}
        maxZoom={fit * 7}
        zoomToCursor
        minAzimuthAngle={DEFAULT_AZIMUTH - AZIMUTH_RANGE}
        maxAzimuthAngle={DEFAULT_AZIMUTH + AZIMUTH_RANGE}
        minPolarAngle={POLAR_MIN}
        maxPolarAngle={POLAR_MAX}
        onStart={onStart}
        onChange={onChange}
      />
    </>
  );
}
