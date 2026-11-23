// The demo bar: a colour scope of its own above everything, with the controls that prove the product's claims.
import { DEMO_WORDS, SurfaceBoundary } from "@manent/ui";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { loadApart } from "../load-apart.ts";
import type { TabPerson } from "../session.ts";
import type { DemoControl } from "./use-demo.ts";
// the Tour's ring is drawn by a sheet in the entry: a sheet imported only by a chunk loaded later is never linked to the page
import "./tour-ring.css";

// the controls are loaded apart from the entry, which their stock components would push over its size budget;
// the bar keeps its height while they arrive, so nothing moves
const controls = loadApart(
  async () => (await import("./demo-bar-controls.tsx")).DemoBarControls,
);
const DemoBarControls = controls.Component;
/** Starts loading the controls' code. */
export function preloadDemoBarControls(): void {
  controls.preload();
}

/**
 * Never takes focus; F6 reaches it. One row while its controls fit: short of room the labels before them and the
 * server's words go, then some buttons keep only their icons, and in the narrowest bar they take a second row rather
 * than widen the window.
 */
export function DemoBar(props: {
  person: TabPerson | null;
  onPersonClick: () => void;
  control: DemoControl | null;
  /** The server line reads resetting whatever the server last answered. */
  resetting: boolean;
}): ReactNode {
  return (
    <section
      data-surface="demo"
      aria-label={DEMO_WORDS.demo}
      className="mn-bar flex min-h-demobar items-center gap-2 border-b border-line-strong bg-chrome px-3 text-meta text-fg sm:gap-3"
    >
      <span className="mn-tag shrink-0" data-fill>
        {DEMO_WORDS.demo}
      </span>
      {/* controls whose code cannot load leave the bar, and the tab, as they are */}
      <SurfaceBoundary fallback={() => null}>
        <Suspense fallback={null}>
          <DemoBarControls {...props} />
        </Suspense>
      </SurfaceBoundary>
    </section>
  );
}
