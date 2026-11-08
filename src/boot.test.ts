import { afterEach, describe, expect, it, vi } from 'vitest';
import { MESSAGES, hideBootScreen, showBootError } from './boot';

function mountBoot() {
  document.body.innerHTML =
    '<div id="boot" role="status"><div class="lantern"></div><p>Entering the Hideout...</p></div>';
  delete document.documentElement.dataset.scene;
}

const boot = () => document.getElementById('boot');

describe('boot screen', () => {
  afterEach(() => vi.useRealTimers());

  it('hides, then removes the loading screen and marks the scene ready', () => {
    vi.useFakeTimers();
    mountBoot();
    hideBootScreen();
    expect(boot()?.classList.contains('boot-hidden')).toBe(true);
    expect(document.documentElement.dataset.scene).toBe('ready');
    vi.advanceTimersByTime(600);
    expect(boot()).toBeNull();
    expect(() => hideBootScreen()).not.toThrow();
  });

  it('shows an error message in place of the loading text, without a retry', () => {
    mountBoot();
    showBootError(MESSAGES.webgl);
    expect(document.querySelector('#boot p')?.textContent).toBe(MESSAGES.webgl);
    expect(boot()?.classList.contains('boot-error')).toBe(true);
    expect(document.querySelector('#boot button')).toBeNull();
    expect(document.documentElement.dataset.scene).toBe('error');
  });

  it('re-creates the screen for errors after boot and offers a retry', () => {
    vi.useFakeTimers();
    mountBoot();
    hideBootScreen();
    vi.advanceTimersByTime(600);
    expect(boot()).toBeNull();

    const reload = vi.fn();
    showBootError(MESSAGES.load, { retry: true, reload });
    expect(boot()?.getAttribute('role')).toBe('status');
    expect(boot()?.classList.contains('boot-hidden')).toBe(false);
    expect(document.querySelector('#boot p')?.textContent).toBe(MESSAGES.load);

    const button = document.querySelector<HTMLButtonElement>('#boot button');
    expect(button?.textContent).toBe('Retry');
    button?.click();
    expect(reload).toHaveBeenCalledOnce();

    // Showing a second error replaces the button instead of adding another.
    showBootError(MESSAGES.crash, { retry: true, reload });
    expect(document.querySelectorAll('#boot button')).toHaveLength(1);
  });

  it('keeps an error visible even if the scene reports ready afterwards', () => {
    vi.useFakeTimers();
    mountBoot();
    showBootError(MESSAGES.crash);
    hideBootScreen();
    vi.advanceTimersByTime(600);
    expect(boot()).not.toBeNull();
    expect(document.documentElement.dataset.scene).toBe('error');
  });
});
