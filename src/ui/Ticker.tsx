import { useState } from 'react';
import { useFeed } from '../feed/useFeed';
import './overlay.css';

/** The last 10 events as sentences (the last 3, one line each, on phone portrait). */
export function Ticker() {
  const { derived } = useFeed();
  const [open, setOpen] = useState(true);
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
