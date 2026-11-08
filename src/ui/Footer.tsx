import { PORTFOLIO_URL } from '../config/site';
import { Freshness } from './Freshness';
import './overlay.css';

export function Footer() {
  return (
    <footer className="ov ov-foot">
      <Freshness />
      <a href={PORTFOLIO_URL} target="_blank" rel="noopener">
        Portfolio
      </a>
    </footer>
  );
}
