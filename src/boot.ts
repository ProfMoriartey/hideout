// Loading screen that index.html shows before any JS runs. After boot it is
// also the one place errors are shown, so a failure never leaves a blank page.

export const BOOT_ID = 'boot';

export const MESSAGES = {
  webgl: 'The Hideout could not open here (WebGL may be unavailable).',
  load: 'The Hideout could not load. Check your connection.',
  crash: 'Something went wrong in the Hideout.',
} as const;

/**
 * Fades out and removes the inline loading screen, then marks the document
 * as ready (`<html data-scene="ready">`). Safe to call more than once.
 */
export function hideBootScreen(doc: Document = document): void {
  // An error shown first wins; never hide it.
  if (doc.documentElement.dataset.scene === 'error') return;
  doc.documentElement.dataset.scene = 'ready';
  const boot = doc.getElementById(BOOT_ID);
  if (!boot) return;
  boot.classList.add('boot-hidden');
  const remove = () => {
    if (doc.documentElement.dataset.scene !== 'error') boot.remove();
  };
  boot.addEventListener('transitionend', remove, { once: true });
  // Fallback when no transition runs (reduced motion, background tab, tests).
  setTimeout(remove, 600);
}

/** Thrown when the lazy scene chunk (three/R3F) fails to download. */
export class ChunkLoadError extends Error {
  override name = 'ChunkLoadError';
}

type ErrorOptions = { retry?: boolean; reload?: () => void };

/**
 * Shows `message` on the loading screen, re-creating it if it was already
 * removed, stops the lantern flicker, and optionally adds a Retry button.
 */
export function showBootError(
  message: string,
  { retry = false, reload = () => location.reload() }: ErrorOptions = {},
  doc: Document = document,
): void {
  doc.documentElement.dataset.scene = 'error';
  let boot = doc.getElementById(BOOT_ID);
  if (!boot) {
    boot = doc.createElement('div');
    boot.id = BOOT_ID;
    boot.setAttribute('role', 'status');
    boot.setAttribute('aria-live', 'polite');
    boot.innerHTML = '<div class="lantern"></div>';
    doc.body.append(boot);
  }
  boot.classList.remove('boot-hidden');
  boot.classList.add('boot-error');
  boot.setAttribute('role', 'alert');

  let text = boot.querySelector('p');
  if (!text) {
    text = doc.createElement('p');
    boot.append(text);
  }
  text.textContent = message;

  boot.querySelector('button')?.remove();
  if (retry) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = 'Retry';
    button.addEventListener('click', () => reload());
    boot.append(button);
    button.focus();
  }
}
