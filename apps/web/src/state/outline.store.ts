// The outline, one row per act, section and scene: written by the bridge, published through the throttle, read one row
// at a time.

import { useContext, useSyncExternalStore } from "react";
import { OutlineContext } from "./bridge-contexts.ts";
import type { Guard } from "./guard.ts";
import { createThrottledList } from "./throttle.ts";

/** A scene, an act, a section, or an Ink knot or stitch; `eighths` is a scene's length in eighths of a page, null for any other kind. */
export interface OutlineRow {
  blockId: string;
  kind: "scene" | "act" | "section" | "knot" | "stitch";
  number: string | null;
  heading: string;
  synopsis: string;
  eighths: number | null;
  /** An omitted scene reads "{number}  OMITTED". */
  omitted: boolean;
  current: boolean;
}

export interface OutlineWriter {
  /** Throttled inside; a new snapshot only when a row changed. */
  publish(rows: readonly OutlineRow[]): void;
  /** Updates only the active heading's block id immediately, without triggering row subscribers. */
  publishCurrent(blockId: string | null): void;
  /** Updates only the viewport-scrolled heading's block id immediately, without triggering row or caret subscribers. */
  publishViewed?(blockId: string | null): void;
}

export interface OutlineSelectors {
  count(): number;
  /** The row at `index`; null past the end. */
  row(index: number): OutlineRow | null;
  subscribe(listener: () => void): () => void;
  /** The active heading's block id; null before the first heading. */
  currentBlockId(): string | null;
  subscribeCurrent(listener: () => void): () => void;
  /** The viewport-scrolled heading's block id (ghost follow); null when unset. */
  viewedBlockId?(): string | null;
  subscribeViewed?(listener: () => void): () => void;
}

const noUnsubscribe = (): (() => void) => () => {};
const noViewed = (): null => null;

/** The outline of one editor. Each publish is checked with `guard` under the name `outline`. */
export function createOutlineStore(options: {
  guard: Guard;
  schedule: (fn: () => void, delayMs: number) => () => void;
  composing: () => boolean;
}): { writer: OutlineWriter; selectors: OutlineSelectors } {
  const rows = createThrottledList<OutlineRow>({
    name: "outline",
    markName: "ui.outline.publish",
    ...options,
  });
  let currentBlockId: string | null = null;
  let viewedBlockId: string | null = null;
  // true once publishCurrent runs after the latest publish(rows), so a queued structural publish cannot clobber it
  let currentOverridden = false;
  const currentListeners = new Set<() => void>();
  const viewedListeners = new Set<() => void>();
  rows.subscribe(() => {
    const list = rows.get();
    if (!currentOverridden) {
      const nextCurrent = list.find((row) => row.current)?.blockId ?? null;
      if (!Object.is(currentBlockId, nextCurrent)) {
        currentBlockId = nextCurrent;
        for (const listener of currentListeners) listener();
      }
    }
    if (
      viewedBlockId !== null &&
      !list.some((row) => row.blockId === viewedBlockId)
    ) {
      viewedBlockId = null;
      for (const listener of viewedListeners) listener();
    }
  });
  return {
    writer: {
      publish(nextRows) {
        currentOverridden = false;
        rows.publish(nextRows);
      },
      publishCurrent(blockId) {
        if (Object.is(currentBlockId, blockId)) {
          currentOverridden = true;
          return;
        }
        options.guard.check("outline");
        currentOverridden = true;
        currentBlockId = blockId;
        for (const listener of currentListeners) listener();
      },
      publishViewed(blockId) {
        if (Object.is(viewedBlockId, blockId)) return;
        options.guard.check("outline");
        viewedBlockId = blockId;
        for (const listener of viewedListeners) listener();
      },
    },
    selectors: {
      count: () => rows.get().length,
      row: (index) => rows.get()[index] ?? null,
      subscribe: rows.subscribe,
      currentBlockId: () => currentBlockId,
      subscribeCurrent(listener) {
        currentListeners.add(listener);
        return () => {
          currentListeners.delete(listener);
        };
      },
      viewedBlockId: () => viewedBlockId,
      subscribeViewed(listener) {
        viewedListeners.add(listener);
        return () => {
          viewedListeners.delete(listener);
        };
      },
    },
  };
}

function useOutline(): OutlineSelectors {
  const outline = useContext(OutlineContext);
  if (outline === null)
    throw new Error("an outline hook is used outside an OutlineContext");
  return outline;
}

export function useOutlineCount(): number {
  const outline = useOutline();
  return useSyncExternalStore(outline.subscribe, outline.count, outline.count);
}

/** The row at `index` in the nearest `OutlineContext`; null past the end. It keeps its reference while the row is unchanged. */
export function useOutlineRow(index: number): OutlineRow | null {
  const outline = useOutline();
  const read = () => outline.row(index);
  return useSyncExternalStore(outline.subscribe, read, read);
}

/** Whether `blockId` is the outline's active heading in the nearest `OutlineContext`. */
export function useIsCurrentOutline(blockId: string): boolean {
  const outline = useOutline();
  const read = (): boolean => outline.currentBlockId() === blockId;
  return useSyncExternalStore(outline.subscribeCurrent, read, read);
}

/** Whether `blockId` is the outline's viewport-scrolled heading (ghost follow) in the nearest `OutlineContext`. */
export function useIsViewedOutline(blockId: string): boolean {
  const outline = useOutline();
  const subscribe = outline.subscribeViewed ?? noUnsubscribe;
  const read = (): boolean => (outline.viewedBlockId?.() ?? null) === blockId;
  return useSyncExternalStore(subscribe, read, read);
}

/** The active heading's block id in the nearest `OutlineContext`; null before the first heading. */
export function useCurrentOutlineId(): string | null {
  const outline = useOutline();
  return useSyncExternalStore(
    outline.subscribeCurrent,
    outline.currentBlockId,
    outline.currentBlockId,
  );
}

/** The viewport-scrolled heading's block id (ghost follow) in the nearest `OutlineContext`; null when unset. */
export function useViewedOutlineId(): string | null {
  const outline = useOutline();
  const subscribe = outline.subscribeViewed ?? noUnsubscribe;
  const read = outline.viewedBlockId ?? noViewed;
  return useSyncExternalStore(subscribe, read, read);
}
