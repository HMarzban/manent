// What a project's row menu holds in the Library; a feature adds its items with one line.
import type { ComponentType } from "react";

export interface ProjectRowItem {
  readonly id: string;
  /** The rows the item is offered on. */
  readonly targets: readonly ("project" | "folder")[];
  /**
   * Draws its entries (`DropdownMenuItem`, `DropdownMenuSub`) inside the row's dropdown menu, for the project or folder
   * `id`; `firstDocId` is the project's first document, null for a folder or a project that holds none.
   */
  readonly Item: ComponentType<{
    target: "project" | "folder";
    id: string;
    firstDocId: string | null;
  }>;
}

/** With no item a row has no menu. */
export const PROJECT_ROW_ITEMS: readonly ProjectRowItem[] = [];
