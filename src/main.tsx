import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { ChunkLoadError } from './boot';
import { SceneBoundary } from './boundaries';

// three, R3F and drei are only imported from App (and below), so they land in
// a lazy chunk (preloaded from index.html at build time, see vite.config.ts).
// The entry chunk is React plus this file; the inline loading screen in
// index.html stays up until the canvas has drawn a frame.
const App = lazy(() =>
  import('./App').catch((error: unknown) => {
    // A failed download is a TypeError; anything else threw while App was
    // evaluating, which is a crash, not a connection problem.
    if (!(error instanceof TypeError)) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new ChunkLoadError(`Scene chunk failed to load: ${reason}`, { cause: error });
  }),
);

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

createRoot(root).render(
  <StrictMode>
    <SceneBoundary>
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </SceneBoundary>
  </StrictMode>,
);
