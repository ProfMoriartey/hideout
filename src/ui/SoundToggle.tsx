// Written by Chrollo
import { useEffect, useState } from 'react';
import { readSoundPref, writeSoundPref } from '../audio/pref';
import './sound.css';

// The audio engine is a separate chunk, fetched only once sound is turned on.
const loadEngine = () => import('../audio/engine');

/** One mute/unmute button. Off by default; the choice is remembered. */
export function SoundToggle() {
  const [on, setOn] = useState(readSoundPref);

  // A remembered "on" cannot start audio by itself (autoplay policy): the first
  // gesture anywhere on the page does. The toggle's own click handles itself.
  useEffect(() => {
    if (!readSoundPref()) return;
    const arm = () => void loadEngine().then((e) => e.setSound(true));
    document.addEventListener('pointerdown', arm, { once: true });
    document.addEventListener('keydown', arm, { once: true });
    return () => {
      document.removeEventListener('pointerdown', arm);
      document.removeEventListener('keydown', arm);
    };
  }, []); // mount only: later toggles are user gestures themselves

  const toggle = () => {
    const next = !on;
    setOn(next);
    writeSoundPref(next);
    // The AudioContext is created inside this click, so the browser allows it.
    void loadEngine().then((e) => e.setSound(next));
  };

  return (
    <button
      type="button"
      className="ov ov-sound"
      aria-pressed={on}
      aria-label={on ? 'Sound on' : 'Sound off'}
      onClick={toggle}
    >
      <span aria-hidden="true">{on ? '🔊' : '🔇'}</span>
    </button>
  );
}
