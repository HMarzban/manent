// A part of the shell whose code is loaded apart from the entry, which the part would push over its size budget.
import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

interface LoadedApart<P extends object> {
  Component: LazyExoticComponent<ComponentType<P>>;
  /** Starts the one load that `Component` draws from. */
  preload(): void;
}

/** A load that fails throws where `Component` is drawn, for the boundary around it. */
export function loadApart<P extends object>(
  importer: () => Promise<ComponentType<P>>,
): LoadedApart<P> {
  let loading: Promise<{ default: ComponentType<P> }> | null = null;
  const load = () =>
    (loading ??= importer().then((component) => ({ default: component })));
  return {
    Component: lazy(load),
    preload() {
      load().catch(() => {
        // the failure is the boundary's to show, once `Component` is drawn
      });
    },
  };
}
