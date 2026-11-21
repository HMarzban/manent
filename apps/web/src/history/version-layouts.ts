// How another feature lays out a version it marks.
import type { PaginationSettings } from "@manent/editor";
import type { VersionContent } from "@manent/sync-protocol";

/** The first non-null answer is the version view's layout patch. */
export const VERSION_LAYOUTS: readonly ((
  content: VersionContent,
) => PaginationSettings["layout"])[] = [];
