// Written by Chrollo
const KEY = 'hideout:sound';

// Private mode or blocked storage throws; treat that as "off" and never break the page.
export function readSoundPref(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeSoundPref(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // shortcut: the choice lasts for this page view only, fine for blocked storage
  }
}
