// The projects and documents the person has marked as favourites, kept in their private index.
import type { SyncClient } from "@manent/sync-client";

export interface Favourites {}

/** Favourites that hold nothing. */
export function createFavourites(_options: {
  client: Promise<SyncClient>;
}): Favourites {
  return {};
}
