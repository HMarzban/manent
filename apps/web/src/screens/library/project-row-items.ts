// What a project's row menu holds in the Library; a feature adds its items with one line.
import type { ComponentType } from "react";

export interface ProjectRowItem {
  readonly id: string;
  /** The rows the item is offered on. */
  readonly targets: readonly ("project" | "folder")[];
  /** Draws its menu items for the project or folder `id`. */
  readonly Item: ComponentType<{ target: "project" | "folder"; id: string }>;
}

/** With no item a row has no menu. */
export const PROJECT_ROW_ITEMS: readonly ProjectRowItem[] = [];
