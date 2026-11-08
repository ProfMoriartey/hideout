// Test-only page for e2e/feed.spec.ts: renders the real feed store as plain text.
// Bundled by the spec at test time; not part of the app, so it never reaches dist.
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { useFeed } from '../../src/feed/useFeed';
import { MEMBER_IDS } from '../../src/feed/validate';

function Harness() {
  const f = useFeed();
  return h(
    'main',
    null,
    h('p', { id: 'status' }, f.status),
    h('p', { id: 'source' }, f.source),
    h('p', { id: 'updated' }, String(f.lastUpdated)),
    h(
      'ul',
      null,
      MEMBER_IDS.map((id) => h('li', { key: id, 'data-id': id }, f.derived.members[id].display)),
    ),
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(h(Harness));
