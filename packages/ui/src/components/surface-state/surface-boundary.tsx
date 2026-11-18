// An error boundary around one surface, so a surface that throws says so in its place and the rest keeps working.
import { Component } from "react";
import type { ReactNode } from "react";

interface SurfaceBoundaryProps {
  fallback: () => ReactNode;
  children: ReactNode;
}

/** Draws `fallback` once a child throws; a new `key` mounts the children again. */
export class SurfaceBoundary extends Component<
  SurfaceBoundaryProps,
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback() : this.props.children;
  }
}
