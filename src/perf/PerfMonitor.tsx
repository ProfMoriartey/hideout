// Applies the quality tier (DPR, frame cap), steps it down on low fps, renders
// on demand when nothing moves (reduced motion), and handles WebGL context loss.
// Hidden tabs need nothing here: browsers stop requestAnimationFrame for them,
// and the monitor ignores the gap when the tab comes back.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { DPR_MAX, LOW_FPS, createMonitor, deviceTier, stepMonitor } from './quality';
import './perf.css';

const motionQuery =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const subscribeMotion = (cb: () => void) => {
  motionQuery?.addEventListener('change', cb);
  return () => motionQuery?.removeEventListener('change', cb);
};
const reducedMotion = () => motionQuery?.matches ?? false;

export function PerfMonitor() {
  const gl = useThree((s) => s.gl);
  const setDpr = useThree((s) => s.setDpr);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
  const [monitor] = useState(() => createMonitor(deviceTier()));
  const [tier, setTier] = useState(monitor.tier);
  const reduced = useSyncExternalStore(subscribeMotion, reducedMotion);

  useEffect(() => {
    document.documentElement.dataset.quality = tier;
    setDpr([1, DPR_MAX[tier]]);
  }, [tier, setDpr]);

  // Reduced motion: nothing animates, so draw only when something asks
  // (controls, camera moves, state changes). Low tier: draw at most LOW_FPS.
  useEffect(() => {
    const capped = tier === 'low';
    setFrameloop(reduced || capped ? 'demand' : 'always');
    invalidate();
    if (reduced || !capped) return;
    let id = 0;
    let last = -Infinity;
    // A few ms of slack so a 60 Hz screen draws every other refresh, not every third.
    const tick = (t: number) => {
      if (t - last >= 1000 / LOW_FPS - 4) {
        last = t;
        invalidate();
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [tier, reduced, setFrameloop, invalidate]);

  // Under demand rendering frame times say nothing about the device; only measure at full rate.
  useFrame((_, dt) => {
    if (!reduced && stepMonitor(monitor, dt)) setTier(monitor.tier);
  });

  // three keeps the context restorable (it calls preventDefault) and re-uploads
  // everything on restore; meanwhile say what happened instead of a blank page.
  useEffect(() => {
    const canvas = gl.domElement;
    const note = document.createElement('div');
    note.className = 'gl-lost';
    note.setAttribute('role', 'alert');
    const text = document.createElement('p');
    text.textContent = 'The view went dark for a moment. Bringing it back...';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = 'Reload';
    reload.onclick = () => location.reload();
    note.append(text, reload);
    const onLost = () => document.body.append(note);
    const onRestored = () => {
      note.remove();
      invalidate();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      note.remove();
    };
  }, [gl, invalidate]);

  return null;
}
