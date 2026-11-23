// What a scene's row menu holds; a feature adds its items with one line.
import type { ComponentType } from "react";

export interface SceneRowItem {
  readonly id: string;
  /** Draws its menu items for the scene whose heading is the block `headingId`. */
  readonly Item: ComponentType<{ docId: string; headingId: string }>;
}

/** With no item the row has no menu. */
export const SCENE_ROW_ITEMS: readonly SceneRowItem[] = [];
