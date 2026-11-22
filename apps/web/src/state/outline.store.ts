// The outline, one row per act, section and scene: written by the bridge, published through the throttle, read one row
// at a time.

import { useContext, useSyncExternalStore } from "react";
import { OutlineContext } from "./bridge-contexts.ts";
import type { Guard } from "./guard.ts";
import { createThrottledList } from "./throttle.ts";

/** A scene, an act or a section; `eighths` is a scene's length in eighths of a page, null for an act or a section. */
export interface OutlineRow {
  blockId: string;
  kind: "scene" | "act" | "section";
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
}

export interface OutlineSelectors {
  count(): number;
  /** The row at `index`; null past the end. */
  row(index: number): OutlineRow | null;
  subscribe(listener: () => void): () => void;
}

/** The outline of one editor. Each publish is checked with `guard` under the name `outline`. */
export function createOutlineStore(options: {
  guard: Guard;
  schedule: (fn: () => void, delayMs: number) => () => void;
  composing: () => boolean;
}): { writer: OutlineWriter; selectors: OutlineSelectors } {
  const rows = createThrottledList<OutlineRow>({ name: "outline", ...options });
  return {
    writer: { publish: rows.publish },
    selectors: {
      count: () => rows.get().length,
      row: (index) => rows.get()[index] ?? null,
      subscribe: rows.subscribe,
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
