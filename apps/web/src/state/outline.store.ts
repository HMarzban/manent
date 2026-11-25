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
}

export interface OutlineSelectors {
  count(): number;
  /** The row at `index`; null past the end. */
  row(index: number): OutlineRow | null;
  subscribe(listener: () => void): () => void;
  /** The active heading's block id; null before the first heading. */
  currentBlockId(): string | null;
  subscribeCurrent(listener: () => void): () => void;
}

/** The outline of one editor. Each publish is checked with `guard` under the name `outline`. */
export function createOutlineStore(options: {
  guard: Guard;
  schedule: (fn: () => void, delayMs: number) => () => void;
  composing: () => boolean;
}): { writer: OutlineWriter; selectors: OutlineSelectors } {
  const rows = createThrottledList<OutlineRow>({ name: "outline", ...options });
  let currentBlockId: string | null = null;
  // true once publishCurrent runs after the latest publish(rows), so a queued structural publish cannot clobber it
  let currentOverridden = false;
  const currentListeners = new Set<() => void>();
  rows.subscribe(() => {
    if (currentOverridden) return;
    const nextCurrent = rows.get().find((row) => row.current)?.blockId ?? null;
    if (Object.is(currentBlockId, nextCurrent)) return;
    currentBlockId = nextCurrent;
    for (const listener of currentListeners) listener();
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
