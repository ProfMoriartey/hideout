// Loading screen that index.html shows before any JS runs.

export const BOOT_ID = 'boot';

/**
 * Fades out and removes the inline loading screen, then marks the document
 * as ready (`<html data-scene="ready">`). Safe to call more than once.
 */
export function hideBootScreen(doc: Document = document): void {
  doc.documentElement.dataset.scene = 'ready';
  const boot = doc.getElementById(BOOT_ID);
  if (!boot) return;
  boot.classList.add('boot-hidden');
  const remove = () => boot.remove();
  boot.addEventListener('transitionend', remove, { once: true });
  // Fallback when no transition runs (reduced motion, background tab, tests).
  setTimeout(remove, 600);
}

/** Replaces the loading text with an error message (e.g. no WebGL). */
export function showBootError(message: string, doc: Document = document): void {
  doc.documentElement.dataset.scene = 'error';
  const text = doc.querySelector(`#${BOOT_ID} p`);
  if (text) text.textContent = message;
}
