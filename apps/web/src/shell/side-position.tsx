// The side position: the present tabs of a side panel's list, at the width the person chose, with an edge to resize it.
import type { SideTab } from "@manent/commands";
import { DOCUMENT_WORDS, PanelTabs } from "@manent/ui";
import { useRef } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { panelsActions, usePanel } from "../state/panels.store.ts";
import type { PanelTab } from "./panel-tab.ts";
import { ShellRegion } from "./regions.tsx";

// copies of the side panel's width range in the panels store, which does not export it
const MIN_WIDTH_PX = 280;
const MAX_WIDTH_PX = 420;
// how far one arrow press moves the edge
const STEP_PX = 8;
// at most this many side tabs, and one more for the Tour, which is present only in demo mode
const TAB_LIMIT = 3;
const TOUR: SideTab = "tour";

/** Throws a RangeError for more present tabs than the side position holds. */
function assertWithinLimit(present: readonly { id: string }[]): void {
  const limit = TAB_LIMIT + (present.some((tab) => tab.id === TOUR) ? 1 : 0);
  if (present.length > limit)
    throw new RangeError(
      `the side position holds at most ${limit} tabs, not ${present.length}`,
    );
}

/** The edge between the page and the panel: dragged, or moved by the arrow keys, it changes the panel's width. */
function ResizeEdge(props: { widthPx: number }): ReactNode {
  const { widthPx } = props;
  const drag = useRef<{ x: number; widthPx: number } | null>(null);
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Home") {
      event.preventDefault();
      panelsActions.resize("side", MIN_WIDTH_PX);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      panelsActions.resize("side", MAX_WIDTH_PX);
      return;
    }
    // the panel is on the right: moving the edge left widens it
    const step =
      event.key === "ArrowLeft"
        ? STEP_PX
        : event.key === "ArrowRight"
          ? -STEP_PX
          : 0;
    if (step === 0) return;
    event.preventDefault();
    panelsActions.resize("side", widthPx + step);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, widthPx };
  };
  const onPointerMove = (event: PointerEvent): void => {
    const start = drag.current;
    if (start !== null)
      panelsActions.resize("side", start.widthPx + start.x - event.clientX);
  };
  const stopDrag = (): void => {
    drag.current = null;
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={DOCUMENT_WORDS.resizeSidePanel}
      aria-valuenow={widthPx}
      aria-valuemin={MIN_WIDTH_PX}
      aria-valuemax={MAX_WIDTH_PX}
      tabIndex={0}
      className="relative w-px shrink-0 cursor-col-resize bg-line transition-colors after:absolute after:inset-y-0 after:-inset-x-1 hover:bg-line-strong focus-visible:bg-accent-solid"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    />
  );
}

/**
 * Draws the present tabs of `tabs`, in list order, at the tab and width the panels store holds; nothing while the
 * panel is closed or its tab is not present. Throws a RangeError past three tabs, or four with the Tour.
 */
export function SidePosition(props: {
  docId: string | null;
  tabs: readonly PanelTab<SideTab>[];
}): ReactNode {
  const { docId, tabs } = props;
  const { tab, widthPx } = usePanel("side");
  // screens pass a list fixed when it loads, so each tab's hook runs in the same order every render
  const present = tabs
    .map((entry) => ({ entry, ...entry.useTab(docId) }))
    .filter((t) => t.present);
  assertWithinLimit(present.map((t) => t.entry));
  const current = present.find((t) => t.entry.id === tab);
  if (current === undefined) return null;
  const { Tab } = current.entry;
  return (
    <ShellRegion
      region="side_panel"
      className="flex min-h-0 bg-chrome"
      style={{ width: widthPx }}
    >
      <ResizeEdge widthPx={widthPx} />
      <div className="min-w-0 flex-1">
        <PanelTabs
          label={DOCUMENT_WORDS.sidePanel}
          tabs={present.map((t) => ({ id: t.entry.id, label: t.label }))}
          current={current.entry.id}
          onChange={(id) => panelsActions.open("side", id)}
          onClose={() => panelsActions.close("side")}
          closeLabel={DOCUMENT_WORDS.closeSidePanel}
        >
          <Tab docId={docId} />
        </PanelTabs>
      </div>
    </ShellRegion>
  );
}
