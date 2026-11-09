// Written by Chrollo
import { useState } from 'react';
import { readSoundPref, writeSoundPref } from '../audio/pref';
import './sound.css';

// The audio engine is a separate chunk, fetched only once sound is turned on.
const loadEngine = () => import('../audio/engine');

let ctx: AudioContext | null = null;

/**
 * Creates the AudioContext synchronously inside the user gesture (iOS Safari
 * refuses one made after the chunk download), then hands it to the engine.
 */
// async: a throwing `new AudioContext()` becomes a rejection the caller reverts on.
async function apply(next: boolean): Promise<void> {
  if (next) {
    ctx ??= new AudioContext();
    void ctx.resume();
  }
  const c = ctx;
  const engine = await loadEngine();
  if (c) engine.setSound(next, c);
}

/** One mute/unmute button. Off by default; the choice is remembered. */
export function SoundToggle() {
  const [on, setOn] = useState(readSoundPref);

  const toggle = () => {
    // A remembered "on" cannot start audio by itself (autoplay policy): the first
    // click starts it and keeps the button on; after that a click flips the state.
    const next = on && !ctx ? true : !on;
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
