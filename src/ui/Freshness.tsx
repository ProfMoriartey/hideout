import { formatDuration } from '../feed/derive';
import { useFeedStatus, useNow } from '../feed/useFeed';
import './overlay.css';

// Calm fixed copy per state: the store's error text is never shown.
const NOTE = {
  loading: 'Connecting...',
  live: '',
  'stale-source': 'Updates are slow right now.',
  offline: 'Offline, retrying.',
  error: 'Feed unavailable.',
} as const;

/** "Updated N s ago" (clamped at 0) plus a calm note when the feed is not live. */
export function Freshness() {
  const { status, lastUpdated } = useFeedStatus();
  const now = useNow(1000);
  const age = lastUpdated === null ? '' : `Updated ${formatDuration(now - lastUpdated)} ago`;
  return (
    <p className="ov-fresh">
      {age}
      {/* Announced once per change, not every second. */}
      <span role="status">{NOTE[status] && ` - ${NOTE[status]}`}</span>
    </p>
  );
}
