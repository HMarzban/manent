// The project scope's settings of a script, kept in its project's index.
import type { Bag } from "@manent/settings";
import type { SyncClient } from "@manent/sync-client";
import type { LibraryIndex } from "../services/ports.ts";

/** The project settings of the script `docId`; null, so every project setting reads its default and none is written. */
export function projectSettingsBag(_options: {
  docId: string;
  client: Promise<SyncClient>;
  library: LibraryIndex;
}): Bag | null {
  return null;
}
