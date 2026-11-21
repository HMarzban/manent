// What another feature adds to a version's row.
import type { CommandId } from "@manent/commands";
import type { VersionItem } from "@manent/sync-protocol";

export interface RowExtension {
  /** The row's second line in place of the summary; the first non-null wins. */
  line(docId: string, item: VersionItem): string | null;
  /** Row-menu items after Restore, Restore this scene and Name this draft…. */
  menu(docId: string, item: VersionItem): readonly CommandId[];
}

export const ROW_EXTENSIONS: readonly RowExtension[] = [];
