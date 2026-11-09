// Room labels and tap picking, with no draw calls: one DOM layer of 13 buttons
// whose positions are rewritten only when the camera or viewport changes (no
// React renders, no allocations per frame). Name + role are always shown; the
// plaque appears once a room is big enough on screen (13 plaques are not
// legible at the phone-portrait default, and the panel always has it).
// The buttons ignore the pointer so drags still pan; a tap is picked with one
// ray-vs-room-box test on the canvas, a keyboard user tabs to the buttons.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Box3, Ray, Raycaster, Vector2, Vector3 } from 'three';
import { MEMBERS, type MemberId } from '../config/members';
import { ticketText } from '../feed/derive';
import { getFeedStore } from '../feed/store';
import { isTap, selectRoom, useSelectedRoom } from '../ui/selection';
import '../ui/room.css';
import { ROOM_ANCHORS } from './voxel/hideout';
import { ROOM } from './voxel/layout';

/** Rooms at least this many px wide also show their plaque. */
const PLAQUE_MIN_PX = 260;

const boxes = MEMBERS.map((m) => {
  const { min, max } = ROOM_ANCHORS[m.id].box;
  return { id: m.id, box: new Box3(new Vector3(...min), new Vector3(...max)) };
});

/** Nearest room hit by the ray, or null. */
// eslint-disable-next-line react-refresh/only-export-components
export function pickRoom(ray: Ray, hit: Vector3 = new Vector3()): MemberId | null {
  let best: MemberId | null = null;
  let bestD = Infinity;
  for (const { id, box } of boxes) {
    if (!ray.intersectBox(box, hit)) continue;
    const d = hit.distanceToSquared(ray.origin);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

function span(parent: HTMLElement, cls: string, text = ''): HTMLElement {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  parent.append(s);
  return s;
}

export function Labels() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const open = useSelectedRoom();

  // While a panel is open only its own label stays (others would ghost around it).
  useEffect(() => {
    const layer = layerRef.el;
    if (!layer) return;
    layer.toggleAttribute('data-panel', open !== null);
    for (const el of layer.children)
      el.toggleAttribute('data-open', el.getAttribute('data-room') === open);
  }, [open]);

  // The DOM layer, kept in sync with the feed (verb / "no recent update").
  useEffect(() => {
    const layer = document.createElement('div');
    layer.className = 'room-labels';
    layer.setAttribute('role', 'group');
    layer.setAttribute('aria-label', 'Rooms');
    const dones: HTMLElement[] = [];
    const tickets: HTMLElement[] = [];
    const verbs = MEMBERS.map((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'room-label';
      b.dataset['room'] = m.id;
      b.setAttribute('aria-haspopup', 'dialog');
      b.onclick = () => selectRoom(m.id);
      span(b, 'room-name', m.name);
      span(b, 'room-role', m.role);
      const verb = span(b, 'room-verb');
      tickets.push(span(b, 'room-ticket'));
      dones.push(span(b, 'room-done')); // screen-reader text for the tick (done state only)
      span(b, 'room-plaque', m.plaque);
      layer.append(b);
      return verb;
    });
    const store = getFeedStore();
    const sync = () => {
      MEMBERS.forEach((m, i) => {
        const { display, verb, ticket } = store.getMember(m.id);
        const el = verbs[i];
        if (!el) return;
        el.textContent =
          display === 'working' && verb ? verb : display === 'stale' ? 'no recent update' : '';
        el.parentElement?.setAttribute('data-state', display);
        const t = tickets[i];
        if (t) t.textContent = display === 'working' && ticket ? ticketText(ticket) : '';
        const d = dones[i];
        if (d) d.textContent = display === 'done' ? 'done' : '';
      });
    };
    sync();
    const off = store.subscribe(sync);
    document.body.append(layer);
    layerRef.el = layer;
    markOpen(layer, openRef.id); // a remounted layer must learn the open room
    last.fill(NaN); // a remounted layer must be placed again
    return () => {
      off();
      layer.remove();
      layerRef.el = null;
    };
  }, []);

  // Tap picking: a press that barely moved is a tap; a second finger cancels it.
  useEffect(() => {
    const el = gl.domElement;
    const down = new Map<number, { x: number; y: number; t: number }>();
    let multi = false;
    const ray = new Raycaster();
    const ndc = new Vector2();
    const onDown = (e: PointerEvent) => {
      if (down.size > 0) multi = true;
      down.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    };
    const onUp = (e: PointerEvent) => {
      const d = down.get(e.pointerId);
      down.delete(e.pointerId);
      if (down.size === 0) {
        const wasMulti = multi;
        multi = false;
        if (wasMulti || !d || e.button > 0) return;
        if (!isTap(e.clientX - d.x, e.clientY - d.y, e.timeStamp - d.t)) return;
        const r = el.getBoundingClientRect();
        ndc.set(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1,
        );
        ray.setFromCamera(ndc, camera);
        selectRoom(pickRoom(ray.ray));
      }
    };
    const onCancel = (e: PointerEvent) => {
      down.delete(e.pointerId);
      if (down.size === 0) multi = false;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
  }, [gl, camera]);

  // Reposition only when the view changed: camera matrix, zoom or viewport.
  useFrame(({ camera: cam, size }) => {
    const layer = layerRef.el;
    if (!layer) return;
    cam.updateMatrixWorld(); // controls ran this frame, the renderer has not yet
    const m = cam.matrixWorld.elements;
    let changed = last[16] !== cam.zoom || last[17] !== size.width || last[18] !== size.height;
    for (let i = 0; i < 16 && !changed; i++) changed = last[i] !== m[i];
    if (!changed) return;
    layer.style.visibility = 'visible';
    for (let i = 0; i < 16; i++) last[i] = m[i] ?? 0;
    last[16] = cam.zoom;
    last[17] = size.width;
    last[18] = size.height;
    layer.toggleAttribute('data-plaque', cam.zoom * ROOM.w >= PLAQUE_MIN_PX);
    layer.style.setProperty('--room-px', `${Math.round(cam.zoom * ROOM.w)}px`);
    const kids = layer.children;
    for (let i = 0; i < MEMBERS.length; i++) {
      const m3 = MEMBERS[i];
      const el = kids[i];
      if (!m3 || !(el instanceof HTMLElement)) continue;
      scratch.set(...ROOM_ANCHORS[m3.id].label).project(cam);
      el.style.transform = `translate(${Math.round((scratch.x * 0.5 + 0.5) * size.width)}px,${Math.round((-scratch.y * 0.5 + 0.5) * size.height)}px) translate(-50%,var(--label-y,0px))`;
    }
  });

  return null;
}

const openRef: { id: MemberId | null } = { id: null };

function markOpen(layer: HTMLElement, id: MemberId | null) {
  layer.toggleAttribute('data-panel', id !== null);
  for (const el of layer.children)
    el.toggleAttribute('data-open', el.getAttribute('data-room') === id);
}

const layerRef: { el: HTMLElement | null } = { el: null };
const last = new Float64Array(19).fill(NaN);
const scratch = new Vector3();
