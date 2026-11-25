// Project episode writes: keeps each episode's stage, pages, open count and lock state current in its project index.
import {
  createEpisodeDraftEvents,
  createEpisodeWrites,
} from "@manent/server-core";
import type { DraftEvents, RoundCounts, SyncHooks } from "@manent/server-core";
import type { ServerService, ServiceDeps } from "./services.ts";

export interface ProjectWiring {
  readonly draftEvents: DraftEvents;
  readonly roundCounts: RoundCounts;
  readonly hooks: SyncHooks;
}

/** Creates the server's shared episode-write ports (draft events, round counts and production hooks). */
export function createProjectWiring(
  deps: Pick<ServiceDeps, "storage" | "sync">,
): ProjectWiring {
  const writes = createEpisodeWrites({
    storage: deps.storage,
    sync: deps.sync,
    log: console.error,
  });
  return {
    draftEvents: createEpisodeDraftEvents(writes),
    roundCounts: writes.roundCounts,
    hooks: writes.hooks,
  };
}

export const projectService: ServerService = {
  create: () => ({ hooks: [], config: {} }),
};
