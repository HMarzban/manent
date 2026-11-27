// The side position: the present tabs of a side panel's list, at the width the person chose, with an edge to resize it.
import type { SideTab } from "@manent/commands";
import {
  Button,
  CloseButton,
  DOCUMENT_WORDS,
  Kbd,
  PanelTabs,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  keyLabel,
  useCommandState,
  useCommands,
} from "@manent/ui";
import { BookmarkPlusIcon, HistoryIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { panelsActions, usePanel } from "../state/panels.store.ts";
import {
  panelWidthCss,
  rootFontScalePx,
  useNarrowPanelOverlay,
} from "./narrow-window.ts";
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
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const start = drag.current;
    if (start !== null) {
      const scale = 16 / rootFontScalePx(event.currentTarget.ownerDocument);
      panelsActions.resize(
        "side",
        Math.round(start.widthPx + (start.x - event.clientX) * scale),
      );
    }
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

function StandaloneHeader(props: {
  readonly id: SideTab;
  readonly label: string;
  readonly onClose: () => void;
}): ReactNode {
  const { id, label, onClose } = props;
  const { service, platform } = useCommands();
  const nameDraft = useCommandState("history.nameDraft");
  const isHistory = id === "history";
  const [chord] = nameDraft.keys;
  return (
    <header className="flex min-h-10 shrink-0 items-center justify-between gap-2 border-b border-line bg-chrome px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        {isHistory ? (
          <HistoryIcon
            aria-hidden="true"
            className="size-icon shrink-0 text-fg-muted"
          />
        ) : null}
        <h2 className="truncate text-ui font-semibold text-fg">
          {isHistory ? DOCUMENT_WORDS.versionHistory : label}
        </h2>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isHistory && nameDraft.visible ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={nameDraft.label}
                  className="cursor-pointer text-fg-muted hover:text-fg"
                  onClick={() => service.run("history.nameDraft", "control")}
                />
              }
            >
              <BookmarkPlusIcon aria-hidden="true" className="size-icon" />
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-1.5">
              <span>{nameDraft.label}</span>
              {chord === undefined ? null : (
                <Kbd>{keyLabel(chord, platform)}</Kbd>
              )}
            </TooltipContent>
          </Tooltip>
        ) : null}
        <CloseButton
          label={
            isHistory
              ? DOCUMENT_WORDS.closeVersionHistory
              : DOCUMENT_WORDS.closeSidePanel
          }
          onClick={onClose}
        />
      </div>
    </header>
  );
}

/**
 * Draws the present tabs of `tabs`, in list order, at the tab and width the panels store holds; nothing while the
 * panel is closed or its tab is not present. Standalone panels (such as Version history) open in dedicated tab-free
 * chrome and are omitted from the standard side tab strip. Throws a RangeError past three strip tabs, or four with Tour.
 */
export function SidePosition(props: {
  docId: string | null;
  tabs: readonly PanelTab<SideTab>[];
  /** True when the caller already wraps SidePosition in its own overlay/scrim. */
  overlayManaged?: boolean;
}): ReactNode {
  const { docId, tabs, overlayManaged = false } = props;
  const { tab, widthPx } = usePanel("side");
  const narrowViewport = useNarrowPanelOverlay();
  const rootRef = useRef<HTMLDivElement>(null);
  const [outerOverlay, setOuterOverlay] = useState(false);
  useLayoutEffect(() => {
    if (overlayManaged || !narrowViewport) {
      setOuterOverlay(false);
      return;
    }
    const parent = rootRef.current?.parentElement ?? null;
    setOuterOverlay(parent?.closest("[data-overlay]") !== null);
  }, [overlayManaged, narrowViewport, tab]);
  // screens pass a list fixed when it loads, so each tab's hook runs in the same order every render
  const present = tabs
    .map((entry) => ({ entry, ...entry.useTab(docId) }))
    .filter((t) => t.present);
  const stripTabs = present.filter((t) => !t.entry.standalone);
  assertWithinLimit(stripTabs.map((t) => t.entry));
  const current = present.find((t) => t.entry.id === tab);
  if (current === undefined) return null;
  const { Tab } = current.entry;
  const isStandalone = current.entry.standalone === true;
  const narrowOverlay = narrowViewport && !overlayManaged && !outerOverlay;
  const panel = (
    <ShellRegion
      region="side_panel"
      className={
        narrowOverlay
          ? "fixed inset-y-0 end-0 z-30 flex min-h-0 border-s border-line bg-chrome shadow-overlay animate-in fade-in-0 slide-in-from-end-4 duration-(--dur-base) ease-out"
          : "flex min-h-0 shrink-0 bg-chrome"
      }
      style={{ width: panelWidthCss(widthPx), maxWidth: "100vw" }}
    >
      {narrowOverlay ? null : <ResizeEdge widthPx={widthPx} />}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {isStandalone ? (
          <>
            <StandaloneHeader
              id={current.entry.id}
              label={current.label}
              onClose={() => panelsActions.close("side")}
            />
            <div
              data-panel-body=""
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <Tab docId={docId} />
            </div>
          </>
        ) : (
          <PanelTabs
            label={DOCUMENT_WORDS.sidePanel}
            tabs={stripTabs.map((t) => ({ id: t.entry.id, label: t.label }))}
            current={current.entry.id}
            onChange={(id) => panelsActions.open("side", id)}
            onClose={() => panelsActions.close("side")}
            closeLabel={DOCUMENT_WORDS.closeSidePanel}
          >
            <Tab docId={docId} />
          </PanelTabs>
        )}
      </div>
    </ShellRegion>
  );
  if (!narrowOverlay)
    return (
      <div ref={rootRef} className="contents">
        {panel}
      </div>
    );
  return (
    <div ref={rootRef} data-overlay="">
      <div
        aria-hidden="true"
        className="fixed inset-0 z-20 bg-scrim animate-in fade-in-0 duration-(--dur-fast) ease-out"
        onClick={() => panelsActions.close("side")}
      />
      {panel}
    </div>
  );
}
