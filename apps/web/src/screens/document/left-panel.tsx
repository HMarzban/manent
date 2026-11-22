// The left panel of a document: the present tabs of its list, at the width the person chose, with an edge to resize it.
import { DOCUMENT_WORDS, PanelTabs } from "@manent/ui";
import { useRef } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { ShellRegion } from "../../shell/regions.tsx";
import { panelsActions, usePanel } from "../../state/panels.store.ts";
import { LEFT_PANEL_TABS } from "./left-tabs.ts";
import { PanelPlace } from "./panel-surface.tsx";

// copies of the left panel's width range in the panels store, which does not export it
const MIN_WIDTH_PX = 200;
const MAX_WIDTH_PX = 360;
// how far one arrow press moves the edge
const STEP_PX = 8;
const TAB_LIMIT = 3;

/** The edge between the panel and the page: dragged, or moved by the arrow keys, it changes the panel's width. */
function ResizeEdge(props: { widthPx: number }): ReactNode {
  const { widthPx } = props;
  const drag = useRef<{ x: number; widthPx: number } | null>(null);
  const onKeyDown = (event: KeyboardEvent): void => {
    // the panel is on the left: moving the edge right widens it
    const step =
      event.key === "ArrowRight"
        ? STEP_PX
        : event.key === "ArrowLeft"
          ? -STEP_PX
          : 0;
    if (step === 0) return;
    event.preventDefault();
    panelsActions.resize("left", widthPx + step);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, widthPx };
  };
  const onPointerMove = (event: PointerEvent): void => {
    const start = drag.current;
    if (start !== null)
      panelsActions.resize("left", start.widthPx + event.clientX - start.x);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={DOCUMENT_WORDS.resizeLeftPanel}
      aria-valuenow={widthPx}
      aria-valuemin={MIN_WIDTH_PX}
      aria-valuemax={MAX_WIDTH_PX}
      tabIndex={0}
      // a hairline, with a wider band to take hold of it
      className="relative w-px shrink-0 cursor-col-resize bg-line transition-colors after:absolute after:inset-y-0 after:-inset-x-1 hover:bg-line-strong"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => {
        drag.current = null;
      }}
    />
  );
}

/**
 * Draws the present tabs of the left panel's list, in list order, at the tab and width the panels store holds; nothing
 * while the panel is closed or its tab is not present. `overlay` draws it over the page. Throws a RangeError past three tabs.
 */
export function LeftPanel(props: {
  docId: string;
  overlay: boolean;
}): ReactNode {
  const { docId, overlay } = props;
  const { tab, widthPx } = usePanel("left");
  // the list is fixed when it loads, so each tab's hook runs in the same order every render
  const present = LEFT_PANEL_TABS.map((entry) => ({
    entry,
    ...entry.useTab(docId),
  })).filter((t) => t.present);
  if (present.length > TAB_LIMIT)
    throw new RangeError(
      `the left panel holds at most ${TAB_LIMIT} tabs, not ${present.length}`,
    );
  const current = present.find((t) => t.entry.id === tab);
  if (current === undefined) return null;
  const { Tab } = current.entry;
  return (
    <PanelPlace over={overlay ? "start" : null}>
      <ShellRegion
        region="left_panel"
        className="flex min-h-0 bg-chrome"
        style={{ width: widthPx }}
      >
        <div className="min-w-0 flex-1">
          <PanelTabs
            label={DOCUMENT_WORDS.leftPanel}
            tabs={present.map((t) => ({ id: t.entry.id, label: t.label }))}
            current={current.entry.id}
            onChange={(id) => panelsActions.open("left", id)}
            onClose={() => panelsActions.close("left")}
            closeLabel={DOCUMENT_WORDS.closeLeftPanel}
          >
            <Tab docId={docId} />
          </PanelTabs>
        </div>
        <ResizeEdge widthPx={widthPx} />
      </ShellRegion>
    </PanelPlace>
  );
}
