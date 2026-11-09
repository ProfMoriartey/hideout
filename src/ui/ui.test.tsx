import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getFeedStore } from '../feed/store';
import type { SourceStatus } from '../feed/source';
import { Freshness } from './Freshness';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
const roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots.length = 0;
  vi.restoreAllMocks();
});

function render(lastUpdated: number | null, status: SourceStatus, now: number) {
  const store = getFeedStore();
  vi.spyOn(store, 'getStatus').mockReturnValue({
    lastUpdated,
    status,
    source: 'api',
  });
  vi.spyOn(store.clock, 'now').mockReturnValue(now);
  const el = document.createElement('div');
  const root = createRoot(el);
  roots.push(root);
  act(() => root.render(<Freshness />));
  return el.textContent;
}

describe('Freshness', () => {
  it('clamps a future lastUpdated at 0 s', () => {
    expect(render(10_000, 'live', 5_000)).toContain('Updated 0 s ago');
  });
  it('formats multi-day ages', () => {
    const day = 86_400_000;
    expect(render(0, 'live', 2 * day + 2 * 3_600_000)).toContain('Updated 2 d 2 h ago');
  });
  it('shows calm copy, never the raw state', () => {
    expect(render(0, 'error', 3000)).toContain('Feed unavailable.');
    expect(render(null, 'offline', 3000)).toContain('Offline, retrying.');
  });
  it('has no dangling separator before the note when nothing was ever loaded', () => {
    expect(render(null, 'offline', 3000)).toBe('Offline, retrying.');
    expect(render(null, 'loading', 3000)).toBe('Connecting...');
    expect(render(0, 'error', 3000)).toBe('Updated 3 s ago - Feed unavailable.');
  });
});
