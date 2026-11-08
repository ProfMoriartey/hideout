import { useFeed } from '../feed/useFeed';
import './overlay.css';

/** Active mission, by codename and ticket count only. */
export function MissionBanner() {
  const { derived } = useFeed();
  // Capped: the validator allows 10 missions, a phone portrait screen cannot show them.
  const active = derived.missions.filter((m) => m.state === 'active').slice(0, 3);
  if (active.length === 0) return null;
  return (
    <div className="ov ov-banner" role="region" aria-label="Active missions">
      {active.map((m) => (
        <p key={m.codename}>{m.label}</p>
      ))}
    </div>
  );
}
