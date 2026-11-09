// Written by Chrollo
// Loaded with a dynamic import the first time sound is turned on. All sound is
// synthesised here with the Web Audio API: original by construction, no files.
import { getFeedStore } from '../feed/store';
import { pickCue, shouldChime, type Cue } from './cues';

const FADE_S = 0.25;
// [frequency Hz, start offset s]
const NOTES: Record<Cue, [number, number][]> = {
  start: [[523.25, 0]],
  done: [
    [783.99, 0],
    [1174.66, 0.14],
  ],
};

const CONFIRM: [number, number][] = [
  [659.25, 0],
  [987.77, 0.12],
];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unsub: (() => void) | null = null;
let suspendTimer: ReturnType<typeof setTimeout> | undefined;
let on = false;
let first = true;
let lastCueAt = -Infinity;
const seen = new Set<string>();

function startAmbient(c: AudioContext, out: AudioNode) {
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.connect(out);
  // A low open fifth with slight detune; the slow tremolo keeps it breathing.
  // The upper pair sits where phone and laptop speakers can actually reproduce
  // it: the 55-110 Hz drone alone was inaudible there, which read as "no sound".
  for (const f of [55, 55.4, 82.4, 110.3, 220.6, 329.6]) {
    const o = c.createOscillator();
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.value = f > 200 ? 0.04 : 0.05;
    o.connect(g).connect(filter);
    o.start();
  }
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.12;
  const depth = c.createGain();
  depth.gain.value = 250; // Hz of cutoff swing
  lfo.connect(depth).connect(filter.frequency);
  lfo.start();
}

function chime(notes: [number, number][]) {
  // A cue on a suspended context would play stale on resume.
  if (!ctx || !master || document.hidden) return;
  const c = ctx;
  const out = master;
  for (const [freq, delay] of notes) {
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.5);
    o.onended = () => g.disconnect();
  }
}

function onFeed() {
  const feed = getFeedStore().getState().snap.feed;
  if (!feed) return;
  const cue = pickCue(seen, feed.events, first);
  first = false;
  const now = performance.now();
  if (cue && shouldChime(cue, lastCueAt, now)) {
    lastCueAt = now;
    chime(NOTES[cue]);
  }
}

function sync() {
  if (!ctx || !master) return;
  clearTimeout(suspendTimer);
  const audible = on && !document.hidden;
  if (audible) {
    void ctx.resume();
    master.gain.setTargetAtTime(1, ctx.currentTime, FADE_S / 3);
  } else {
    master.gain.setTargetAtTime(0, ctx.currentTime, FADE_S / 3);
    suspendTimer = setTimeout(() => void ctx?.suspend(), FADE_S * 1000);
  }
}

/** Turn all sound on or off. Safe to call repeatedly. The caller creates `context` inside a user gesture. */
export function setSound(next: boolean, context: AudioContext): void {
  if (next === on) return;
  on = next;
  if (on) {
    if (!ctx) {
      ctx = context;
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      startAmbient(ctx, master);
      document.addEventListener('visibilitychange', sync);
    }
    // Events already in the feed when sound starts are old news: no cues for them.
    first = true;
    seen.clear();
    unsub = getFeedStore().subscribe(onFeed);
    onFeed();
    // Immediate audible confirmation of the tap (cues otherwise wait for feed events).
    // Its own pitches, so it neither counts as nor rate-limits a feed cue.
    chime(CONFIRM);
  } else {
    unsub?.();
    unsub = null;
  }
  sync();
}
