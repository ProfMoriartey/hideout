import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getFeedStore } from '../feed/store';
import { Freshness } from './Freshness';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => vi.restoreAllMocks());

function render(lastUpdated: number | null, status: string, now: number) {
  const store = getFeedStore();
  vi.spyOn(store, 'getStatus').mockReturnValue({
    lastUpdated,
    status: status as never,
    source: 'api',
  });
  vi.spyOn(store.clock, 'now').mockReturnValue(now);
  const el = document.createElement('div');
  act(() => createRoot(el).render(<Freshness />));
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
    expect(render(0, 'error', 3000)).toContain('Feed unavailable');
    expect(render(null, 'offline', 3000)).toContain('Offline, retrying.');
  });
});
