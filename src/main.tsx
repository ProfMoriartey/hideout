import { Component, StrictMode, Suspense, lazy, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { showBootError } from './boot';

// three, R3F and drei are only imported from App (and below), so they land in
// a lazy chunk. The entry chunk is just React plus this file; the inline
// loading screen in index.html stays up until the canvas has drawn a frame.
const App = lazy(() => import('./App'));

class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    showBootError('The Hideout could not open here (WebGL may be unavailable).');
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

createRoot(root).render(
  <StrictMode>
    <SceneErrorBoundary>
      <Suspense fallback={null}>
        <App />
      </Suspense>
    </SceneErrorBoundary>
  </StrictMode>,
);
