// Present mode outline hooks and scroll navigation: outline subscription, scroll spy and block jumping.
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { subscribeLiveEditors } from "../../../editor-host/live-editor.ts";
import { OutlineContext } from "../../../state/bridge-contexts.ts";
import type { OutlineRow } from "../../../state/outline.store.ts";

const PAGE_REGION = "[data-region='page']";
const DESK_SELECTOR = ".mn-desk";
const NO_ROWS: readonly OutlineRow[] = Object.freeze([]);
const PASSIVE = { passive: true } as const;
const noop = (): void => {};

const escapeSelector = (value: string): string =>
  typeof CSS !== "undefined" ? CSS.escape(value) : value;

export interface ActivePresentScene {
  readonly activeBlockId: string | null;
  readonly progress: number;
}

export interface PresentGoToCommand {
  readonly kind: "go_to";
  readonly blockId: string;
  readonly offset: number;
}

/** Subscribes to `OutlineContext` with reference-stable snapshot caching. */
export function useOutlineRows(): readonly OutlineRow[] {
  const outline = useContext(OutlineContext);
  const subscribe = useCallback(
    (notify: () => void) => outline?.subscribe(notify) ?? noop,
    [outline],
  );
  const cacheRef = useRef(NO_ROWS);
  const readSnapshot = (): readonly OutlineRow[] => {
    if (outline === null) return NO_ROWS;
    const next: OutlineRow[] = [];
    for (let i = 0; i < outline.count(); i++) {
      const row = outline.row(i);
      if (row !== null) next.push(row);
    }
    const prev = cacheRef.current;
    if (
      prev.length !== next.length ||
      prev.some((row, index) => row !== next[index])
    )
      cacheRef.current = next;
    return cacheRef.current;
  };
  return useSyncExternalStore(subscribe, readSnapshot, readSnapshot);
}

/** Finds the last resolved heading at or above `cutoff` via binary search over document-ordered elements. */
function findActiveHeading(
  region: Element,
  rows: readonly OutlineRow[],
  cutoff: number,
): string | null {
  const headings: { blockId: string; element: Element }[] = [];
  for (const row of rows) {
    const element = region.querySelector(
      `[data-id="${escapeSelector(row.blockId)}"]`,
    );
    if (element !== null && !element.classList.contains("el-hidden"))
      headings.push({ blockId: row.blockId, element });
  }
  if (headings.length === 0) return null;
  if (headings[0]!.element.getBoundingClientRect().top > cutoff) return null;

  let low = 0;
  let high = headings.length - 1;
  let active: string | null = null;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const entry = headings[mid]!;
    if (entry.element.getBoundingClientRect().top <= cutoff) {
      active = entry.blockId;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return active;
}

function readActiveScene(
  rows: readonly OutlineRow[],
  currentBlockId: string | null,
): ActivePresentScene {
  const fallback =
    currentBlockId ??
    rows.find((row) => row.current)?.blockId ??
    rows[0]?.blockId ??
    null;
  const region = document.querySelector(PAGE_REGION);
  if (region === null) return { activeBlockId: fallback, progress: 0 };
  const maxScroll = region.scrollHeight - region.clientHeight;
  const progress =
    maxScroll > 0
      ? Math.min(
          100,
          Math.max(0, Math.round((region.scrollTop / maxScroll) * 100)),
        )
      : 0;
  const { top, height } = region.getBoundingClientRect();
  const cutoff = top + height * 0.28;
  const active = findActiveHeading(region, rows, cutoff);
  return { activeBlockId: active ?? fallback, progress };
}

/** Tracks the active outline row and scroll progress of the page region across scrolls, resizes and editor mounts. */
export function useActivePresentScene(
  rows: readonly OutlineRow[],
): ActivePresentScene {
  const outline = useContext(OutlineContext);
  const subscribeCurrent = useCallback(
    (notify: () => void) => outline?.subscribeCurrent(notify) ?? noop,
    [outline],
  );
  const readCurrent = (): string | null => outline?.currentBlockId() ?? null;
  const currentBlockId = useSyncExternalStore(
    subscribeCurrent,
    readCurrent,
    readCurrent,
  );
  const [state, setState] = useState<ActivePresentScene>(() =>
    readActiveScene(rows, currentBlockId),
  );
  useEffect(() => {
    const sync = (): void =>
      setState((prev) => {
        const next = readActiveScene(rows, currentBlockId);
        return prev.activeBlockId === next.activeBlockId &&
          prev.progress === next.progress
          ? prev
          : next;
      });
    sync();

    let raf = 0;
    const scheduleSync = (): void => {
      if (raf !== 0) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        sync();
      });
    };

    let listenedRegion: Element | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const bindRegion = (): void => {
      const region = document.querySelector(PAGE_REGION);
      if (region !== listenedRegion) {
        listenedRegion?.removeEventListener("scroll", scheduleSync);
        region?.addEventListener("scroll", scheduleSync, PASSIVE);
        listenedRegion = region;
      }
      if (typeof ResizeObserver === "undefined") return;
      resizeObserver?.disconnect();
      if (region === null) return;
      resizeObserver = new ResizeObserver(scheduleSync);
      resizeObserver.observe(region);
      const desk = region.querySelector(DESK_SELECTOR);
      if (desk !== null) resizeObserver.observe(desk);
    };

    bindRegion();
    window.addEventListener("resize", scheduleSync, PASSIVE);
    const unsubscribeEditors = subscribeLiveEditors(() => {
      bindRegion();
      scheduleSync();
    });

    return () => {
      listenedRegion?.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      resizeObserver?.disconnect();
      unsubscribeEditors();
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [rows, currentBlockId]);
  return state;
}

/** Scrolls to a rendered block in the page region, falling back to an editor jump when virtualised away. */
export function jumpToPresentBlock(
  blockId: string,
  editorRun?: (command: PresentGoToCommand) => void,
): void {
  const target = document.querySelector(
    `${PAGE_REGION} [data-id="${escapeSelector(blockId)}"]`,
  );
  if (target === null) {
    editorRun?.({ kind: "go_to", blockId, offset: 0 });
    return;
  }
  const reducedMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  target.scrollIntoView?.({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "start",
  });
}
