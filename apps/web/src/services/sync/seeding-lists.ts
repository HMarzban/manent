// The Library's lists of a workspace still being seeded: empty until its seeding finishes, then its shelf's own.
import type { DocHandle } from "@manent/sync-client";
import type { WorkspaceRef } from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { ContinueItem, LibraryIndex, ProjectItem } from "../ports.ts";
import { cached } from "./cached.ts";
import type { Shelf } from "./index-shelves.ts";

/** The shelf of a workspace still being seeded: opening no index, and refusing a new project. */
export function seedingShelf(): Shelf {
  const handle = Promise.reject<DocHandle>(
    new Error("The workspace is still being seeded."),
  );
  // only a new project asks for the index, and it is told the refusal
  handle.catch(() => {});
  return {
    projects: createValue<readonly ProjectItem[]>([]),
    continueList: createValue<readonly ContinueItem[]>([]),
    loadState: createValue<"cached" | "problem">("cached"),
    handle,
    ready: Promise.resolve(),
    opened: null,
  };
}

export interface SeedingWatch {
  workspaces: Subscribable<readonly WorkspaceRef[]>;
  isSeeding: (ws: string) => boolean;
}

/**
 * `seeded` while workspace `ws` is being seeded; once it is not, `pick`'s list, which it switches to once. `pick` is
 * called only then, since asking for a shelf opens its index.
 */
function followSeeding<T>(
  watch: SeedingWatch,
  ws: string,
  seeded: T,
  pick: () => Subscribable<T>,
): Subscribable<T> {
  let adopted: Subscribable<T> | null = null;
  const source = (): Subscribable<T> | null => {
    if (adopted === null && !watch.isSeeding(ws)) adopted = pick();
    return adopted;
  };
  // a workspace that is ready opens its index when its list is asked for, as its shelf does
  source();
  return {
    get: () => source()?.get() ?? seeded,
    subscribe(listener) {
      let stopList = source()?.subscribe(listener) ?? null;
      const stopWorkspaces = watch.workspaces.subscribe(() => {
        const list = source();
        if (list === null || stopList !== null) return;
        stopList = list.subscribe(listener);
        listener(list.get());
      });
      return () => {
        stopWorkspaces();
        stopList?.();
      };
    },
  };
}

/** Each workspace's lists, one value per list that a caller may keep, never a fixed one while it is being seeded. */
export function createSeedingLists(
  watch: SeedingWatch,
  shelf: (ws: string) => Shelf,
): Pick<LibraryIndex, "continueList" | "projects" | "loadState"> {
  const continued = new Map<string, Subscribable<readonly ContinueItem[]>>();
  const projects = new Map<string, Subscribable<readonly ProjectItem[]>>();
  const states = new Map<string, Subscribable<"cached" | "problem">>();
  return {
    continueList: (ws) =>
      cached(continued, ws, () =>
        followSeeding(watch, ws, [], () => shelf(ws).continueList),
      ),
    projects: (ws) =>
      cached(projects, ws, () =>
        followSeeding(watch, ws, [], () => shelf(ws).projects),
      ),
    loadState: (ws) =>
      cached(states, ws, () =>
        followSeeding(watch, ws, "cached", () => shelf(ws).loadState),
      ),
  };
}
