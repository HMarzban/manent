// Horizontal Board scrolling helpers: episode-snapping step math, Shift+wheel & desk grab-pan, and floating edge pan buttons.
import {
  BOARD_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@manent/ui";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode, RefObject } from "react";

const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, [tabindex], [role="button"], [data-board-card], [data-row-menu]';
const PAN_THRESHOLD_PX = 4;

/** Computes the next snap-aligned scrollLeft when stepping episodes left (-1) or right (+1). */
export function computeNextEpisodeScrollLeft(params: {
  readonly scrollLeft: number;
  readonly clientWidth: number;
  readonly scrollWidth: number;
  readonly railWidth: number;
  readonly columnLefts: readonly number[];
  readonly direction: -1 | 1;
}): number {
  const {
    scrollLeft,
    clientWidth,
    scrollWidth,
    railWidth,
    columnLefts,
    direction,
  } = params;
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  if (maxScroll <= 0) return 0;

  const usableWidth = Math.max(160, clientWidth - railWidth);
  const stops = columnLefts
    .map((left) =>
      Math.max(0, Math.min(maxScroll, Math.round(left - railWidth))),
    )
    .filter((stop, i, arr) => i === 0 || stop !== arr[i - 1]);
  if (stops.length === 0) {
    return Math.max(
      0,
      Math.min(
        maxScroll,
        scrollLeft + direction * Math.round(usableWidth * 0.75),
      ),
    );
  }

  const desiredStep = Math.round(usableWidth * 0.72);
  if (direction === 1) {
    const ideal = Math.min(maxScroll, scrollLeft + desiredStep);
    // Pick the furthest stop <= ideal that still advances past scrollLeft, or the next stop right after scrollLeft.
    const advancing = stops.filter((s) => s > scrollLeft + 8);
    if (advancing.length === 0) return maxScroll;
    const withinStep = advancing.filter((s) => s <= ideal + 24);
    return withinStep.length > 0
      ? withinStep[withinStep.length - 1]!
      : advancing[0]!;
  }

  const ideal = Math.max(0, scrollLeft - desiredStep);
  const retreating = stops.filter((s) => s < scrollLeft - 8);
  if (retreating.length === 0) return 0;
  const withinStep = retreating.filter((s) => s >= ideal - 24);
  return withinStep.length > 0
    ? withinStep[0]!
    : retreating[retreating.length - 1]!;
}

/** Enables Shift+wheel horizontal panning and grab-to-pan on empty Board desk space (or middle-mouse anywhere). */
export function useBoardPan(viewportRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const onWheel = (event: WheelEvent): void => {
      if (
        !event.shiftKey ||
        Math.abs(event.deltaX) >= 1 ||
        event.deltaY === 0
      ) {
        return;
      }
      if (viewport.scrollWidth <= viewport.clientWidth + 4) return;
      event.preventDefault();
      viewport.scrollLeft += event.deltaY;
    };

    let activePointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let dragging = false;

    const endPan = (): void => {
      if (activePointerId === null) return;
      if (dragging && viewport.hasPointerCapture(activePointerId)) {
        viewport.releasePointerCapture(activePointerId);
      }
      activePointerId = null;
      dragging = false;
      delete viewport.dataset.panning;
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (event.pointerType !== "mouse") return;
      if (
        viewport.scrollWidth <= viewport.clientWidth + 4 &&
        viewport.scrollHeight <= viewport.clientHeight + 4
      ) {
        return;
      }
      const isMiddle = event.button === 1;
      if (!isMiddle && event.button !== 0) return;
      const target = event.target;
      if (
        !isMiddle &&
        target instanceof Element &&
        target.closest(INTERACTIVE_SELECTOR) !== null
      ) {
        return;
      }
      if (isMiddle) event.preventDefault();
      activePointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      originLeft = viewport.scrollLeft;
      originTop = viewport.scrollTop;
      dragging = false;
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (activePointerId === null || event.pointerId !== activePointerId)
        return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return;
        dragging = true;
        viewport.dataset.panning = "true";
        viewport.setPointerCapture(event.pointerId);
      }
      viewport.scrollLeft = originLeft - dx;
      viewport.scrollTop = originTop - dy;
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", endPan);
    viewport.addEventListener("pointercancel", endPan);
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", endPan);
      viewport.removeEventListener("pointercancel", endPan);
      endPan();
    };
  }, [viewportRef]);
}

export interface BoardEdgeScrollersProps {
  readonly canScrollStart: boolean;
  readonly canScrollEnd: boolean;
  onScrollEpisodes(direction: -1 | 1): void;
}

/** Both-edge overflow fade veils and high-contrast floating scroll steppers when horizontal overflow exists. */
export function BoardEdgeScrollers(props: BoardEdgeScrollersProps): ReactNode {
  const { canScrollStart, canScrollEnd, onScrollEpisodes } = props;
  return (
    <>
      <div aria-hidden="true" className="mn-board-fade-start" />
      <div aria-hidden="true" className="mn-board-fade-end" />
      {canScrollStart ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                data-side="start"
                aria-label={BOARD_WORDS.scrollLeft}
                onClick={() => onScrollEpisodes(-1)}
                className="mn-board-pan-btn cursor-pointer"
              />
            }
          >
            <ChevronLeftIcon aria-hidden="true" className="size-4" />
          </TooltipTrigger>
          <TooltipContent>{BOARD_WORDS.scrollLeft}</TooltipContent>
        </Tooltip>
      ) : null}
      {canScrollEnd ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                data-side="end"
                aria-label={BOARD_WORDS.scrollRight}
                onClick={() => onScrollEpisodes(1)}
                className="mn-board-pan-btn cursor-pointer"
              />
            }
          >
            <ChevronRightIcon aria-hidden="true" className="size-4" />
          </TooltipTrigger>
          <TooltipContent>{BOARD_WORDS.scrollRight}</TooltipContent>
        </Tooltip>
      ) : null}
    </>
  );
}
