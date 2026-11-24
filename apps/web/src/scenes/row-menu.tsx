// A scene's row menu, from its handle, a right-click or the context-menu key, on a row or a card: the items features
// register, Move among them.
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DropdownMenuItem,
  SCENE_MOVE_WORDS,
} from "@manent/ui";
import type { ReactNode } from "react";
import { RowMenu } from "../screens/library/row-place.tsx";
import { startSceneMove } from "./moves.ts";
import type { SceneRowItem } from "./row-items.ts";

// what only a person who can edit is given, so that a reader's row draws no menu that would open empty
const EDITING_ITEMS: ReadonlySet<string> = new Set(["move"]);

/** Picks the scene up for a move by the arrow keys, as Space on its row does. */
export function MoveItem(props: {
  docId: string;
  headingId: string;
}): ReactNode {
  const { headingId } = props;
  return (
    <DropdownMenuItem onClick={() => startSceneMove(headingId)}>
      {SCENE_MOVE_WORDS.move}
    </DropdownMenuItem>
  );
}

/** The items of `items` this person is given: without the ones that change the script for a person who cannot edit. */
export function rowItemsFor(
  items: readonly SceneRowItem[],
  canEdit: boolean,
): readonly SceneRowItem[] {
  return canEdit ? items : items.filter((item) => !EDITING_ITEMS.has(item.id));
}

/**
 * `children` draws the row or card with the menu's handle, or null when `items` is empty and the row has no
 * menu; the items come from the caller, so that the list they are registered in never imports this file back.
 */
export function SceneRowMenu(props: {
  docId: string;
  headingId: string;
  title: string;
  items: readonly SceneRowItem[];
  children(handle: ReactNode): ReactNode;
}): ReactNode {
  const { docId, headingId, items } = props;
  if (items.length === 0) return props.children(null);
  const entries = items.map(({ id, Item }) => (
    <Item key={id} docId={docId} headingId={headingId} />
  ));
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        {props.children(<RowMenu title={props.title}>{entries}</RowMenu>)}
      </ContextMenuTrigger>
      <ContextMenuContent>{entries}</ContextMenuContent>
    </ContextMenu>
  );
}
