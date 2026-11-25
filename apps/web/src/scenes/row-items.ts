// What a scene's row menu holds; a feature adds its items with one line.
import type { ComponentType } from "react";
import { AssignmentRowItems } from "../assignment/scene-row-items.tsx";
import { CommentSceneItem } from "../comments/scene-row-item.tsx";
import { CutSceneItem } from "../material/cuts/scene-row-items.tsx";
import { SidesSceneItem } from "../send/sides-file.tsx";
import { MoveItem } from "./row-menu.tsx";

export interface SceneRowItem {
  readonly id: string;
  /** Draws its entries (`DropdownMenuItem`, `DropdownMenuSub`) inside the row's dropdown menu, for the scene whose heading is the block `headingId`. */
  readonly Item: ComponentType<{ docId: string; headingId: string }>;
}

/** With no item the row has no menu. */
export const SCENE_ROW_ITEMS: readonly SceneRowItem[] = [
  { id: "assignment", Item: AssignmentRowItems },
  { id: "comment", Item: CommentSceneItem },
  { id: "move", Item: MoveItem },
  { id: "cuts", Item: CutSceneItem },
  { id: "sides", Item: SidesSceneItem },
];
