// What a document's row menu holds in the Library; a feature adds its items with one line.
import type { ComponentType } from "react";

export interface DocumentRowItem {
  readonly id: string;
  /** Draws its entries (`DropdownMenuItem`, `DropdownMenuSub`) inside the row's dropdown menu, for the document `docId`. */
  readonly Item: ComponentType<{ docId: string }>;
}

/** With no item a row has no menu. */
export const DOCUMENT_ROW_ITEMS: readonly DocumentRowItem[] = [];
