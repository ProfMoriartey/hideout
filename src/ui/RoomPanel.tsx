import { useEffect, useRef } from 'react';
import { MEMBER_BY_ID } from '../config/members';
import type { DisplayState, MemberView } from '../feed/derive';
import { useFeed } from '../feed/useFeed';
import { focusRoom, resetView } from '../scene/CameraRig';
import { selectRoom, useSelectedRoom } from './selection';
import './overlay.css';
import './room.css';

const STATE_TEXT: Record<DisplayState, string> = {
  idle: 'Idle',
  working: 'Working',
  done: 'Done',
  stale: 'No recent update',
};

/** Share of the bar to fill, 0..1; a zero total shows an empty bar. */
function barFraction(done: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
}

function Details({ m }: { m: MemberView }) {
  const p = m.progress;
  return (
    <dl className="room-facts">
      <dt>State</dt>
      <dd>{STATE_TEXT[m.display]}</dd>
      {m.verb && m.display === 'working' && (
        <>
          <dt>Doing</dt>
          <dd>{m.verb}</dd>
        </>
      )}
      {m.mission && (
        <>
          <dt>Mission</dt>
          <dd>Operation {m.mission}</dd>
        </>
      )}
      {m.runningFor && m.display === 'working' && (
        <>
          <dt>Running</dt>
          <dd>{m.runningFor}</dd>
        </>
      )}
      {p && (
        <>
          <dt>Tickets</dt>
          <dd>
            {p.done} / {p.total}
            <span
              className="room-bar"
              role="progressbar"
              aria-label="Tickets done"
              aria-valuemin={0}
              aria-valuemax={p.total}
              aria-valuenow={Math.min(p.done, p.total)}
            >
              <span style={{ width: `${barFraction(p.done, p.total) * 100}%` }} />
            </span>
          </dd>
        </>
      )}
    </dl>
  );
}

function Panel({ id }: { id: keyof typeof MEMBER_BY_ID }) {
  const cfg = MEMBER_BY_ID[id];
  const { derived } = useFeed();
  const box = useRef<HTMLDivElement>(null);

  // Move focus in on open, back to where it was on close; glide to the room.
  useEffect(() => {
    const opener = document.activeElement;
    box.current?.focus();
    focusRoom(id);
    return () => {
      if (opener instanceof HTMLElement && opener !== document.body) opener.focus();
    };
  }, [id]);
  useEffect(() => () => resetView(), []);

  return (
    <div
      ref={box}
      className="ov room-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="room-panel-title"
      tabIndex={-1}
    >
      <button
        type="button"
        className="room-close"
        aria-label="Close"
        onClick={() => selectRoom(null)}
      >
        ×
      </button>
      <h2 id="room-panel-title">{cfg.name}</h2>
      <p className="room-role">{cfg.role}</p>
      <p className="room-plaque-text">{cfg.plaque}</p>
      <Details m={derived.members[id]} />
    </div>
  );
}

/** Tap panel for one room: only config copy, allowlisted feed values and numbers. */
export function RoomPanel() {
  const id = useSelectedRoom();
  // Escape also works when focus is back on the page (e.g. after a canvas tap).
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && selectRoom(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);
  return id ? <Panel id={id} /> : null;
}
