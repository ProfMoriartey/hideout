// Written by Chrollo
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeedEvent } from '../feed/types';
import { CUE_GAP_MS, pickCue, shouldChime } from './cues';
import { readSoundPref, writeSoundPref } from './pref';

const ev = (at: string, kind: FeedEvent['kind'], who: FeedEvent['who'] = 'feitan'): FeedEvent => ({
  at,
  who,
  kind,
});

describe('pickCue', () => {
  it('stays silent for events present on first load', () => {
    const seen = new Set<string>();
    expect(pickCue(seen, [ev('t1', 'done'), ev('t0', 'start')], true)).toBeNull();
    expect(pickCue(seen, [ev('t1', 'done'), ev('t0', 'start')], false)).toBeNull();
  });
  it('cues on new start and done events, done winning in a burst', () => {
    const seen = new Set<string>();
    pickCue(seen, [], true);
    expect(pickCue(seen, [ev('t1', 'start')], false)).toBe('start');
    expect(
      pickCue(seen, [ev('t2', 'start', 'machi'), ev('t3', 'done'), ev('t1', 'start')], false),
    ).toBe('done');
  });
  it('ignores progress and mission events', () => {
    const seen = new Set<string>();
    pickCue(seen, [], true);
    expect(pickCue(seen, [ev('t1', 'progress'), ev('t2', 'mission-start')], false)).toBeNull();
  });
  it('does not grow past the current events', () => {
    const seen = new Set<string>();
    pickCue(seen, [ev('t1', 'start'), ev('t2', 'start')], false);
    pickCue(seen, [ev('t3', 'start')], false);
    expect(seen.size).toBe(1);
  });
});

describe('shouldChime', () => {
  it('rate limits start cues inside the gap', () => {
    expect(shouldChime('start', 1000, 1000 + CUE_GAP_MS - 1)).toBe(false);
    expect(shouldChime('start', 1000, 1000 + CUE_GAP_MS)).toBe(true);
    expect(shouldChime('start', -Infinity, 0)).toBe(true);
  });
  it('lets a done cue through the gap', () => {
    expect(shouldChime('done', 1000, 1001)).toBe(true);
  });
});

describe('sound preference', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });
  it('is off by default and remembers the choice', () => {
    expect(readSoundPref()).toBe(false);
    writeSoundPref(true);
    expect(readSoundPref()).toBe(true);
    writeSoundPref(false);
    expect(readSoundPref()).toBe(false);
  });
  it('survives blocked storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readSoundPref()).toBe(false);
    expect(() => writeSoundPref(true)).not.toThrow();
  });
});
