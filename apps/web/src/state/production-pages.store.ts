// The Pages tab's rows and the scenes holding an active mark: written by the editor's pages feed, published through the throttle.

import type { PageRow, PagesSink } from "@manent/editor";
import type { Subscribable } from "@manent/ui";
import type { Guard } from "./guard.ts";
import { createThrottledList } from "./throttle.ts";

export interface ProductionPagesSelectors {
  count(): number;
  /** The row at `index`; null past the end. */
  row(index: number): PageRow | null;
  subscribe(listener: () => void): () => void;
  /** The heading ids of the scenes holding an active mark. */
  readonly revisedScenes: Subscribable<ReadonlySet<string>>;
}

/** The pages of one editor. Each publish is checked with `guard` under the names `production_pages` and `revised_scenes`. */
export function createProductionPagesStore(options: {
  guard: Guard;
  schedule: (fn: () => void, delayMs: number) => () => void;
  composing: () => boolean;
}): { sink: PagesSink; selectors: ProductionPagesSelectors } {
  const rows = createThrottledList<PageRow>({
    name: "production_pages",
    ...options,
  });
  const scenes = createThrottledList<{ readonly blockId: string }>({
    name: "revised_scenes",
    ...options,
  });
  let listed = scenes.get();
  let sceneIds: ReadonlySet<string> = new Set();
  const revisedScenes = (): ReadonlySet<string> => {
    if (scenes.get() !== listed) {
      listed = scenes.get();
      sceneIds = new Set(listed.map((scene) => scene.blockId));
    }
    return sceneIds;
  };
  return {
    sink: {
      publish(pages, revised) {
        rows.publish(pages);
        scenes.publish(revised.map((blockId) => ({ blockId })));
      },
    },
    selectors: {
      count: () => rows.get().length,
      row: (index) => rows.get()[index] ?? null,
      subscribe: rows.subscribe,
      revisedScenes: {
        get: revisedScenes,
        subscribe: (listener) =>
          scenes.subscribe(() => listener(revisedScenes())),
      },
    },
  };
}
