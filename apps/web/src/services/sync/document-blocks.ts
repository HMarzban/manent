// The blocks of a document this device holds.
import type { BlockJSON } from "@manent/schema";
import type { SyncClient } from "@manent/sync-client";

/** The blocks of `docId` as this device holds them; null for a document it does not hold, which every document reads as here. */
export function documentBlocks(
  _client: Promise<SyncClient>,
  _docId: string,
): Promise<readonly BlockJSON[] | null> {
  return Promise.resolve(null);
}
