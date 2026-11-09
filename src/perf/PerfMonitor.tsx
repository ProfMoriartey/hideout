// Runs the fps monitor, caps low tier at LOW_FPS, and handles WebGL context
// loss. App owns the tier and passes DPR and frameloop to <Canvas> as props:
// R3F re-applies Canvas props on every resize, so setting them imperatively
// here would be undone by the first rotation.
// Hidden tabs need nothing here: browsers stop requestAnimationFrame for them,
// and the monitor ignores the gap when the tab comes back.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { LOW_FPS, createMonitor, stepMonitor, type Tier } from './quality';
import './perf.css';

type Props = { tier: Tier; reduced: boolean; onDrop: (tier: Tier) => void };

export function PerfMonitor({ tier, reduced, onDrop }: Props) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const [monitor] = useState(() => createMonitor(tier));

  useEffect(() => {
    document.documentElement.dataset.quality = tier;
  }, [tier]);

  // Low tier renders on demand; this asks for a frame at most LOW_FPS times a second.
  useEffect(() => {
    if (reduced || tier !== 'low') return;
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
  }, [tier, reduced, invalidate]);

  // Under demand rendering frame times say nothing about the device; only measure at full rate.
  useFrame((_, dt) => {
    if (!reduced && stepMonitor(monitor, dt)) onDrop(monitor.tier);
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
    let before: Element | null = null;
    const onLost = () => {
      before = document.activeElement;
      document.body.append(note);
      reload.focus();
    };
    const onRestored = () => {
      note.remove();
      if (before instanceof HTMLElement && before.isConnected) before.focus();
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
