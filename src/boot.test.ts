import { afterEach, describe, expect, it, vi } from 'vitest';
import { hideBootScreen, showBootError } from './boot';

function mountBoot() {
  document.body.innerHTML = '<div id="boot"><p>Entering the Hideout...</p></div>';
  delete document.documentElement.dataset.scene;
}

describe('boot screen', () => {
  afterEach(() => vi.useRealTimers());

  it('hides, then removes the loading screen and marks the scene ready', () => {
    vi.useFakeTimers();
    mountBoot();
    hideBootScreen();
    expect(document.getElementById('boot')?.classList.contains('boot-hidden')).toBe(true);
    expect(document.documentElement.dataset.scene).toBe('ready');
    vi.advanceTimersByTime(600);
    expect(document.getElementById('boot')).toBeNull();
    expect(() => hideBootScreen()).not.toThrow();
  });

  it('shows an error message in place of the loading text', () => {
    mountBoot();
    showBootError('No WebGL here.');
    expect(document.querySelector('#boot p')?.textContent).toBe('No WebGL here.');
    expect(document.documentElement.dataset.scene).toBe('error');
  });
});
