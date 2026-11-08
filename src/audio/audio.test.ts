// Written by Chrollo
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeedEvent } from '../feed/types';
import { pickCue } from './cues';
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
