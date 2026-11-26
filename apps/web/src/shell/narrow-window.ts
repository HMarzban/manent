// Shared viewport and root-font scaling helpers for shell panels (SidePosition and LeftPanel).
import { useSyncExternalStore } from "react";

/** Below this viewport width, a docked side panel would crush the main column and must overlay instead. */
export const NARROW_PANEL_OVERLAY_PX = 768;

/** Below this viewport width (`sm`), secondary demo bar tools fold into a compact popover so the bar stays one row. */
export const NARROW_DEMO_BAR_PX = 640;

const BASE_ROOT_FONT_PX = 16;

export function isNarrowPanelViewport(widthPx: number): boolean {
  return widthPx < NARROW_PANEL_OVERLAY_PX;
}

/**
 * Converts a stored base-16 panel width to `rem`, so panels scale cleanly with
 * `html[data-ui-size="125"|"150"|"200"]` (paired with `maxWidth: "100vw"` so they never overflow a narrow viewport).
 */
export function panelWidthCss(widthPx: number): string {
  const rem = Number((widthPx / BASE_ROOT_FONT_PX).toFixed(4));
  return `${rem}rem`;
}

/** Current root font size in px, used to convert pointer-drag deltas back into base-16 panel width units. */
export function rootFontScalePx(doc: Document): number {
  const size = Number.parseFloat(
    getComputedStyle(doc.documentElement).fontSize,
  );
  return Number.isFinite(size) && size > 0 ? size : BASE_ROOT_FONT_PX;
}

function subscribeToResize(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

function readNarrowViewport(): boolean {
  return (
    typeof window !== "undefined" && isNarrowPanelViewport(window.innerWidth)
  );
}

function readNarrowDemoBar(): boolean {
  return (
    typeof window !== "undefined" && window.innerWidth < NARROW_DEMO_BAR_PX
  );
}

const serverNotNarrow = (): boolean => false;

/** True while the viewport is narrower than `NARROW_PANEL_OVERLAY_PX`. SSR-safe. */
export function useNarrowPanelOverlay(): boolean {
  return useSyncExternalStore(
    subscribeToResize,
    readNarrowViewport,
    serverNotNarrow,
  );
}

/** True while the viewport is narrower than `NARROW_DEMO_BAR_PX` (`sm`). SSR-safe. */
export function useNarrowDemoBar(): boolean {
  return useSyncExternalStore(
    subscribeToResize,
    readNarrowDemoBar,
    serverNotNarrow,
  );
}
