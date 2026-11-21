import { Component, type ReactNode } from 'react';

type Props = { fallback: ReactNode; onError?: () => void; children: ReactNode };

/** Catches a missing native WebView (old binary) or a map render crash so the app stays up. */
export class MapErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(): void { this.props.onError?.(); }
  render(): ReactNode { return this.state.failed ? this.props.fallback : this.props.children; }
}
