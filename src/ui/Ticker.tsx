import { useState } from 'react';
import { useFeed } from '../feed/useFeed';
import './overlay.css';

// Collapsed on phone portrait so it never sits on the hideout by default.
const startOpen = () => !window.matchMedia('(max-width: 600px)').matches;

/** The last 10 events as sentences built from member name, kind and verb. */
export function Ticker() {
  const { derived } = useFeed();
  const [open, setOpen] = useState(startOpen);
  if (derived.ticker.length === 0) return null;
  return (
    <details className="ov ov-ticker" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Activity</summary>
      <ul aria-label="Recent activity">
        {derived.ticker.map((l) => (
          <li key={l.key}>
            {l.text} - <time>{l.ago}</time>
          </li>
        ))}
      </ul>
    </details>
  );
}
