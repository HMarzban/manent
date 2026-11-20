// The demo bar: a colour scope of its own above everything, with the person, the server and the Tour.
import { DEMO_WORDS, SurfaceBoundary } from "@manent/ui";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { loadApart } from "../load-apart.ts";
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
export const preloadDemoBarControls = controls.preload;

/** Never takes focus; F6 reaches it. */
export function DemoBar(props: {
  personLabel: string;
  onPersonClick: () => void;
  control: DemoControl | null;
}): ReactNode {
  return (
    <section
      data-surface="demo"
      aria-label={DEMO_WORDS.demo}
      className="flex h-demobar items-center gap-2 bg-chrome px-3 text-meta text-fg"
    >
      <span className="font-semibold tracking-wide uppercase">
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
