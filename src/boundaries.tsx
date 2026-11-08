import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ChunkLoadError, MESSAGES, showBootError } from './boot';

function messageFor(error: unknown): { text: string; retry: boolean } {
  if (error instanceof ChunkLoadError) return { text: MESSAGES.load, retry: true };
  const msg = error instanceof Error ? error.message : String(error);
  if (/webgl/i.test(msg)) return { text: MESSAGES.webgl, retry: false };
  return { text: MESSAGES.crash, retry: true };
}

type Props = { children?: ReactNode };
type State = { failed: boolean };

/**
 * Wraps the scene (lazy chunk and Canvas). On error the scene unmounts and
 * the loading screen comes back as a visible error message.
 */
export class SceneBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    const { text, retry } = messageFor(error);
    showBootError(text, { retry });
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Wraps DOM overlays (panel, banner, ticker, sound). A broken overlay
 * disappears and logs; the scene keeps running.
 */
export class OverlayBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Overlay failed', error, info.componentStack);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
