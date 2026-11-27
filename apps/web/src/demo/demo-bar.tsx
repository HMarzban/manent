// The demo stage: an Archival Stone & Studio Ochre proof margin above the shipping app.
import { DEMO_WORDS, Skeleton, SurfaceBoundary } from "@manent/ui";
import { Suspense, useRef } from "react";
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
 * Never takes focus; F6 reaches it. Polarity-matched Archival Stone & Studio Ochre rail with a 2 px top proof edge
 * that adapts across Light, Dark and all 24 studio themes.
 */
export function DemoBar(props: {
  person: TabPerson | null;
  onPersonClick: () => void;
  control: DemoControl | null;
  /** The server line reads resetting whatever the server last answered. */
  resetting: boolean;
}): ReactNode {
  const sectionRef = useRef<HTMLElement>(null);
  return (
    <section
      ref={sectionRef}
      data-surface="demo"
      aria-label={DEMO_WORDS.demo}
      className="mn-bar relative flex h-demobar min-h-demobar min-w-0 max-w-full shrink-0 items-center gap-2 overflow-x-clip border-b border-line bg-chrome px-2.5 text-meta text-fg sm:gap-2.5 sm:px-3.5"
    >
      <span className="mn-tag mn-demo-tag shrink-0" data-fill>
        <span aria-hidden="true" className="mn-demo-dot" data-tone="accent" />
        {DEMO_WORDS.demo}
      </span>
      {/* controls whose code cannot load leave the bar, and the tab, as they are */}
      <SurfaceBoundary fallback={() => null}>
        <Suspense
          fallback={
            <div aria-busy="true" className="flex flex-1 items-center gap-2">
              <Skeleton aria-hidden="true" className="h-control-sm w-28" />
              <Skeleton aria-hidden="true" className="h-control-sm w-24" />
            </div>
          }
        >
          <DemoBarControls {...props} barRef={sectionRef} />
        </Suspense>
      </SurfaceBoundary>
    </section>
  );
}
