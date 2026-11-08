// Written by Chrollo
import { useEffect, useState } from 'react';
import { readSoundPref, writeSoundPref } from '../audio/pref';
import './sound.css';

// The audio engine is a separate chunk, fetched only once sound is turned on.
const loadEngine = () => import('../audio/engine');

let ctx: AudioContext | null = null;

/**
 * Creates the AudioContext synchronously inside the user gesture (iOS Safari
 * refuses one made after the chunk download), then hands it to the engine.
 */
function apply(next: boolean): Promise<void> {
  if (next) {
    ctx ??= new AudioContext();
    void ctx.resume();
  }
  const c = ctx;
  return loadEngine().then((e) => {
    if (c) e.setSound(next, c);
  });
}

/** One mute/unmute button. Off by default; the choice is remembered. */
export function SoundToggle() {
  const [on, setOn] = useState(readSoundPref);

  // A remembered "on" cannot start audio by itself (autoplay policy): the first
  // gesture anywhere on the page does. The toggle's own click then flips it.
  useEffect(() => {
    if (!readSoundPref()) return;
    const cleanup = () => {
      document.removeEventListener('pointerup', arm);
      document.removeEventListener('keydown', arm);
    };
    const arm = () => {
      cleanup();
      if (readSoundPref()) apply(true).catch(() => setOn(false));
    };
    document.addEventListener('pointerup', arm);
    document.addEventListener('keydown', arm);
    return cleanup;
  }, []); // mount only: later toggles are user gestures themselves

  const toggle = () => {
    const next = !on;
    setOn(next);
    writeSoundPref(next);
    // A failed chunk or AudioContext must not leave the button saying "on".
    apply(next).catch(() => {
      setOn(false);
      writeSoundPref(false);
    });
  };

  return (
    <button
      type="button"
      className="ov ov-sound"
      aria-pressed={on}
      aria-label="Sound"
      onClick={toggle}
    >
      <span aria-hidden="true">{on ? '🔊' : '🔇'}</span>
    </button>
  );
}
