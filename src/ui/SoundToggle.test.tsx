// Written by Chrollo
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { SoundToggle } from './SoundToggle';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('is off by default and reverts to off when the AudioContext cannot be created', async () => {
  const create = vi.fn(() => {
    throw new Error('no audio');
  });
  vi.stubGlobal('AudioContext', create);
  const el = document.createElement('div');
  const root = createRoot(el);
  act(() => root.render(<SoundToggle />));
  const button = el.querySelector('button');
  expect(button?.getAttribute('aria-pressed')).toBe('false');
  expect(create).not.toHaveBeenCalled();

  await act(async () => button?.click());
  expect(create).toHaveBeenCalledTimes(1);
  expect(button?.getAttribute('aria-pressed')).toBe('false');
  expect(localStorage.getItem('hideout:sound')).toBe('off');

  // The next click must try again, not be stuck on.
  await act(async () => button?.click());
  expect(create).toHaveBeenCalledTimes(2);
  expect(button?.getAttribute('aria-pressed')).toBe('false');
  act(() => root.unmount());
});
