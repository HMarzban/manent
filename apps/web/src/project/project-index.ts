// A project's index: its template, style, seasons, episodes, names, facts, groups, board, ladder and sources.
import type { SyncClient } from "@manent/sync-client";

export interface ProjectIndex {}

/** An index that holds nothing. */
export function openProjectIndex(_options: {
  client: Promise<SyncClient>;
  projectId: string;
}): ProjectIndex {
  return {};
}
