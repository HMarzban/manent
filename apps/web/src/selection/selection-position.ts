// Geometry and lifecycle for a pointer-made selection inside the page: resolves the toolbar's viewport anchor and hides on
// page keystrokes, outside presses or focus moving to an external surface (such as an inline popover).
import { useEffect, useState } from "react";
import { useEnvironment } from "../services/context.tsx";

const SHOW_AFTER_MS = 150;
export const EDGE_PX = 8;
const PAGE_REGION = "[data-region='page']";
// the bar and its More menu, which is drawn outside it
const TOOLBAR = "[data-selection-toolbar]";
// the bar's height and its gap, rem: with less of the page than this above the selection, the bar stands under it
const BAR_ROOM_REM = 2.5;
// extra top clearance when the floating Book format bar sits over the top of the page
const FLOATING_BAR_ROOM_REM = 5.75;

type Side = "above" | "below";

/** In px of the window: the bar is centred on `x`, with its bottom edge 8 px above `y`, or its top edge 8 px below. */
export interface Place {
  x: number;
  y: number;
  side: Side;
}

export const SHIFT: Readonly<Record<Side, string>> = Object.freeze({
  above: "translate(-50%, calc(-100% - 0.5rem))",
  below: "translate(-50%, 0.5rem)",
});

const isWithin = (target: EventTarget | null, selector: string): boolean =>
  target instanceof Element && target.closest(selector) !== null;

/**
 * Where the bar stands over the window's selection, inside the page's region; null while the selection is collapsed,
 * zero-sized, outside the page, or scrolled out of the region's sight.
 */
function placeOfSelection(): Place | null {
  const selection = document.getSelection();
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed)
    return null;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  const region = element?.closest(PAGE_REGION) ?? null;
  if (region === null) return null;
  const page = region.getBoundingClientRect();
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  if (rect.bottom <= page.top || rect.top >= page.bottom) return null;
  const visibleTop = Math.max(rect.top, page.top);
  const visibleBottom = Math.min(rect.bottom, page.bottom);
  const rootPx =
    parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const hasFloatingBar = region.getAttribute("data-floating-bar") === "true";
  const topRoom =
    (hasFloatingBar ? FLOATING_BAR_ROOM_REM : BAR_ROOM_REM) * rootPx;
  const bottomRoom = BAR_ROOM_REM * rootPx;
  const x = rect.left + rect.width / 2;
  if (visibleTop - page.top >= topRoom)
    return { x, y: visibleTop, side: "above" };
  if (page.bottom - visibleBottom >= bottomRoom)
    return { x, y: visibleBottom, side: "below" };
  return { x, y: page.top + EDGE_PX, side: "below" };
}

/**
 * The place of a selection the primary pointer made in the page, from 150 ms after the press that made it ends, until a key
 * is pressed in the page, the pointer presses outside the bar, focus moves outside the page and bar, or the selection changes
 * some other way. A change that follows a press on the bar (a style redraws the selected text) moves the bar with the
 * selection instead.
 */
export function usePointerSelection(docId: string): Place | null {
  const { schedule } = useEnvironment();
  const [place, setPlace] = useState<Place | null>(null);
  useEffect(() => {
    let pressing = false;
    let fromBar = false;
    let wait: (() => void) | null = null;
    const hide = (): void => {
      wait?.();
      wait = null;
      setPlace(null);
    };
    const follow = (): void =>
      setPlace((shown) => (shown === null ? null : placeOfSelection()));
    const onPointerDown = (event: PointerEvent): void => {
      fromBar = isWithin(event.target, TOOLBAR);
      if (fromBar) return;
      if (!isWithin(event.target, PAGE_REGION)) {
        pressing = false;
        hide();
        return;
      }
      // a secondary press keeps the browser's own menu, with nothing of ours beside it
      pressing = event.button === 0;
      hide();
    };
    const onPointerUp = (): void => {
      if (!pressing) return;
      pressing = false;
      wait = schedule(() => {
        wait = null;
        setPlace(placeOfSelection());
      }, SHOW_AFTER_MS);
    };
    const onPointerCancel = (): void => {
      pressing = false;
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isWithin(event.target, PAGE_REGION)) return;
      fromBar = false;
      hide();
    };
    const onFocusIn = (event: FocusEvent): void => {
      if (
        isWithin(event.target, PAGE_REGION) ||
        isWithin(event.target, TOOLBAR)
      )
        return;
      fromBar = false;
      hide();
    };
    const onSelectionChange = (): void => {
      // the press's own changes arrive until the wait ends, which reads the selection afresh
      if (pressing || wait !== null) return;
      if (fromBar || isWithin(document.activeElement, TOOLBAR)) follow();
      else hide();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      hide();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [schedule, docId]);
  return place;
}
