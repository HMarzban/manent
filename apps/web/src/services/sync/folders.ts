// The folders of each workspace the person can open, kept in the workspace's index.
import type { SyncClient } from "@manent/sync-client";

export interface Folders {}

/** Folders that hold nothing. */
export function createFolders(_options: {
  client: Promise<SyncClient>;
}): Folders {
  return {};
}
