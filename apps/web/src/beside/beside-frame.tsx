// The frame of what is beside the page: over the page's trailing half, a header row of its title, both status slots and
// ✕, the lines under that row, and its body. The page moves aside, out from under it.
import { BESIDE_WORDS, CloseButton, DOCUMENT_WORDS } from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useStatusSlots } from "../screens/document/status-button.tsx";
import type { BesideKindId } from "./kinds.ts";

const PAGE_REGION = "[data-region='page']";
const PAGE_AREA = Object.freeze({ gridArea: "page" });
const DEFAULT_PERCENT = 50;
const MIN_PERCENT = 30;
const MAX_PERCENT = 70;
const STEP_PERCENT = 5;

const clampPercent = (value: number): number =>
  Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, Math.round(value)));

const isRtl = (element: Element | null): boolean =>
  element !== null && getComputedStyle(element).direction === "rtl";

/** The status in the header's two slots, as the title bar says it. */
function BesideStatus(props: { source: Subscribable<StatusFacts> }): ReactNode {
  const { root, deviceSlot, serverSlot } = useStatusSlots(props.source);
  return (
    <span role="status" aria-live="polite" className="flex min-w-0 shrink">
      <span
        ref={root}
        className="group flex min-w-0 shrink tabular-nums data-[tone=alert]:text-danger data-[tone=attention]:text-attention data-[tone=quiet]:text-fg-muted"
      >
        <span ref={deviceSlot} className="shrink-0 group-data-spans:hidden" />
        <span className="shrink-0 whitespace-pre group-data-spans:hidden">
          {" · "}
        </span>
        <span ref={serverSlot} className="min-w-0 truncate" />
      </span>
    </span>
  );
}

/** Draggable and keyboard-accessible separator along the beside pane's inline-start edge. */
function BesideResizeEdge(props: {
  percent: number;
  container: HTMLElement;
  onChange(next: number): void;
}): ReactNode {
  const { percent, container, onChange } = props;
  const drag = useRef<{ x: number; percent: number } | null>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Home") {
      event.preventDefault();
      onChange(MIN_PERCENT);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      onChange(MAX_PERCENT);
      return;
    }
    const rtl = isRtl(container);
    const step =
      event.key === "ArrowLeft"
        ? rtl
          ? -STEP_PERCENT
          : STEP_PERCENT
        : event.key === "ArrowRight"
          ? rtl
            ? STEP_PERCENT
            : -STEP_PERCENT
          : 0;
    if (step === 0) return;
    event.preventDefault();
    onChange(clampPercent(percent + step));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, percent };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const start = drag.current;
    if (start === null) return;
    const width = container.getBoundingClientRect().width || window.innerWidth;
    if (width <= 0) return;
    const rtl = isRtl(container);
    const deltaPx = rtl ? event.clientX - start.x : start.x - event.clientX;
    onChange(clampPercent(start.percent + (deltaPx / width) * 100));
  };

  const stopDrag = (): void => {
    drag.current = null;
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={BESIDE_WORDS.resizeLabel}
      aria-valuenow={percent}
      aria-valuemin={MIN_PERCENT}
      aria-valuemax={MAX_PERCENT}
      tabIndex={0}
      className="absolute inset-y-0 start-0 z-20 w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-line-strong focus-visible:bg-accent-solid"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    />
  );
}

/**
 * `kind` is what the frame holds: a version of the page's own document, which counts as part of the page, or a kind of
 * `BESIDE_KINDS`, which is the side position. `status` is null for an output, which has none. Nothing is drawn while
 * the window has no page.
 */
export function BesideFrame(props: {
  kind: BesideKindId | "version";
  title: string;
  status: Subscribable<StatusFacts> | null;
  onClose(): void;
  /** Under the header row, inside the header. */
  lines: ReactNode;
  children: ReactNode;
}): ReactNode {
  const { kind, title, status, onClose, lines, children } = props;
  const [percent, setPercent] = useState(DEFAULT_PERCENT);
  const page = document.querySelector<HTMLElement>(PAGE_REGION);
  useLayoutEffect(() => {
    if (page === null) return undefined;
    page.style.paddingInlineEnd = `${percent}%`;
    return () => {
      page.style.paddingInlineEnd = "";
    };
  }, [page, percent]);
  const grid = page?.parentElement ?? null;
  if (grid === null) return null;
  return createPortal(
    <div
      role="region"
      aria-label={BESIDE_WORDS.regionLabel(title)}
      data-beside={kind}
      data-tour="beside"
      data-region={kind === "version" ? "page" : "side_panel"}
      className="relative z-10 flex min-h-0 animate-in flex-col justify-self-end border-s border-line bg-desk duration-(--dur-base) ease-out fade-in-0 slide-in-from-end-4"
      style={{ ...PAGE_AREA, width: `${percent}%` }}
    >
      <BesideResizeEdge
        percent={percent}
        container={page ?? grid}
        onChange={setPercent}
      />
      <header className="flex flex-col gap-1 border-b border-line bg-chrome px-3 py-2 text-ui">
        <div className="flex items-center gap-2">
          <span title={title} className="min-w-0 flex-1 truncate font-medium">
            {title}
          </span>
          {status === null ? null : <BesideStatus source={status} />}
          <CloseButton
            label={DOCUMENT_WORDS.closeBeside(title)}
            onClick={onClose}
          />
        </div>
        {lines}
      </header>
      {children}
    </div>,
    grid,
  );
}
