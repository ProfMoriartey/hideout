import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Ray, Vector3 } from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MEMBER_BY_ID } from '../config/members';
import type { MemberView } from '../feed/derive';
import { pickRoom } from '../scene/Labels';
import { ROOM_ANCHORS } from '../scene/voxel/hideout';
import { RoomPanel } from './RoomPanel';
import { isTap, selectRoom } from './selection';

const view: { current: Partial<MemberView> } = { current: {} };
vi.mock('../feed/useFeed', () => ({
  useFeed: () => ({ derived: { members: { kortopi: view.current } } }),
}));
const camera = vi.hoisted(() => ({ focusRoom: vi.fn(), resetView: vi.fn() }));
vi.mock('../scene/CameraRig', () => camera);

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
const roots: Root[] = [];
afterEach(() => {
  act(() => selectRoom(null));
  act(() => roots.forEach((r) => r.unmount()));
  roots.length = 0;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

function open(v: Partial<MemberView>) {
  view.current = v;
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  roots.push(root);
  act(() => root.render(<RoomPanel />));
  act(() => selectRoom('kortopi'));
  return el;
}

describe('isTap', () => {
  it('separates a tap from a pan drag', () => {
    expect(isTap(2, 3, 120)).toBe(true);
    expect(isTap(30, 0, 120)).toBe(false);
    expect(isTap(0, 0, 900)).toBe(false);
  });
});

describe('pickRoom', () => {
  it('hits the room whose box the ray passes through, nearest first', () => {
    const c = ROOM_ANCHORS.kortopi.center;
    const ray = new Ray(new Vector3(c[0], c[1], c[2] + 100), new Vector3(0, 0, -1));
    expect(pickRoom(ray)).toBe('kortopi');
    expect(pickRoom(new Ray(new Vector3(1e4, 1e4, 100), new Vector3(0, 0, -1)))).toBeNull();
  });
});

describe('RoomPanel', () => {
  it('shows nothing until a room is selected, then config copy and all fields', () => {
    const el = open({
      display: 'working',
      verb: 'forging',
      mission: 'Silk Lantern',
      runningFor: '42 min',
      progress: { done: 3, total: 7 },
    });
    const dialog = el.ownerDocument.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('room-panel-title');
    const t = dialog?.textContent ?? '';
    for (const s of [
      MEMBER_BY_ID.kortopi.name,
      MEMBER_BY_ID.kortopi.role,
      MEMBER_BY_ID.kortopi.plaque,
      'Working',
      'forging',
      'Operation Silk Lantern',
      '42 min',
      '3 / 7',
    ])
      expect(t).toContain(s);
    expect(dialog?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('3');
    expect(camera.focusRoom).toHaveBeenCalledWith('kortopi');
    expect(document.activeElement).toBe(dialog);
  });

  it('leaves out what is unknown and a verb that is not current', () => {
    const el = open({ display: 'idle', verb: 'forging' });
    const t = el.ownerDocument.body.textContent ?? '';
    expect(t).toContain('Idle');
    for (const s of ['forging', 'Mission', 'Running', 'Tickets']) expect(t).not.toContain(s);
  });

  it('says so when stale (no running time), and survives a zero total', () => {
    const el = open({ display: 'stale', runningFor: '5 h 2 min', progress: { done: 0, total: 0 } });
    const bar = el.ownerDocument.querySelector('.room-bar > span');
    expect(el.ownerDocument.body.textContent).toContain('No recent update');
    expect(bar?.getAttribute('style')).toContain('0%');
    expect(el.ownerDocument.body.textContent).not.toContain('Running');
  });

  it('closes with the button and Escape, restoring focus and the view', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    open({ display: 'idle' });
    act(() => document.querySelector<HTMLElement>('.room-close')?.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(camera.resetView).toHaveBeenCalled();
    act(() => selectRoom('kortopi'));
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
