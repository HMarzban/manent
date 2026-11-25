// The Pages tab's rows and the scenes holding an active mark: written by the editor's pages feed, published at once
// since the feed already throttles to 250 ms and skips while composing.

import type { PageRow, PagesSink } from "@manent/editor";
import type { Subscribable } from "@manent/ui";
import type { Guard } from "./guard.ts";

export interface ProductionPagesSelectors {
  count(): number;
  /** The row at `index`; null past the end. */
  row(index: number): PageRow | null;
  subscribe(listener: () => void): () => void;
  /** The heading ids of the scenes holding an active mark. */
  readonly revisedScenes: Subscribable<ReadonlySet<string>>;
}

const isSameRow = (a: PageRow, b: PageRow): boolean =>
  a.index === b.index &&
  a.label === b.label &&
  a.locked === b.locked &&
  a.level === b.level &&
  a.revision === b.revision &&
  a.revisionName === b.revisionName;

const isSameScenes = (a: ReadonlySet<string>, b: readonly string[]): boolean =>
  a.size === b.length && b.every((id) => a.has(id));

/** The pages of one editor. Each publish is checked with `guard` under the names `production_pages` and `revised_scenes`. */
export function createProductionPagesStore(options: {
  guard: Guard;
  schedule: (fn: () => void, delayMs: number) => () => void;
  composing: () => boolean;
}): { sink: PagesSink; selectors: ProductionPagesSelectors } {
  let rows: readonly PageRow[] = [];
  let sceneIds: ReadonlySet<string> = new Set();
  const rowListeners = new Set<() => void>();
  const sceneListeners = new Set<(ids: ReadonlySet<string>) => void>();
  let pending: {
    rows: readonly PageRow[];
    revised: readonly string[];
  } | null = null;
  let cancelRetry: (() => void) | null = null;

  const commit = (
    nextPages: readonly PageRow[],
    nextRevised: readonly string[],
  ): void => {
    const merged = nextPages.map((item, i) => {
      const before = rows[i];
      return before !== undefined && isSameRow(before, item) ? before : item;
    });
    const rowsChanged =
      merged.length !== rows.length ||
      merged.some((item, i) => item !== rows[i]);
    if (rowsChanged) {
      options.guard.check("production_pages");
      rows = merged;
      for (const listener of rowListeners) listener();
    }
    if (!isSameScenes(sceneIds, nextRevised)) {
      options.guard.check("revised_scenes");
      sceneIds = new Set(nextRevised);
      for (const listener of sceneListeners) listener(sceneIds);
    }
  };

  const flushPending = (): void => {
    cancelRetry = null;
    if (pending === null) return;
    if (options.composing()) {
      cancelRetry = options.schedule(flushPending, 50);
      return;
    }
    const { rows: nextRows, revised } = pending;
    pending = null;
    commit(nextRows, revised);
  };

  return {
    sink: {
      publish(pages, revised) {
        if (options.composing()) {
          pending = { rows: pages, revised };
          cancelRetry ??= options.schedule(flushPending, 50);
          return;
        }
        pending = null;
        cancelRetry?.();
        cancelRetry = null;
        commit(pages, revised);
      },
    },
    selectors: {
      count: () => rows.length,
      row: (index) => rows[index] ?? null,
      subscribe(listener) {
        rowListeners.add(listener);
        return () => {
          rowListeners.delete(listener);
        };
      },
      revisedScenes: {
        get: () => sceneIds,
        subscribe(listener) {
          sceneListeners.add(listener);
          return () => {
            sceneListeners.delete(listener);
          };
        },
      },
    },
  };
}
