import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Contains a crash to one section of the page.
 *
 * Optional, decorative sub-trees (the WebGL case, a lazily-loaded chunk) must
 * never take the whole route down: without a local boundary their errors climb
 * to the router's `errorComponent`, which replaces the entire product page with
 * a red error card seconds after it opened.
 */
export default class SafeBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; onError?: (error: unknown) => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Logged, not surfaced: the fallback already keeps the page usable.
    console.error("[SafeBoundary]", error, info.componentStack);
    this.props.onError?.(error);
  }

  override render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
