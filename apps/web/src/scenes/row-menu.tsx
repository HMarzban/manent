// A scene's row menu, from its handle, a right-click or the context-menu key, on a row or a card: the items features
// register, Move among them.
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  SCENE_MOVE_WORDS,
} from "@manent/ui";
import {
  ArrowDownIcon,
  ArrowDownToLineIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowUpToLineIcon,
} from "lucide-react";
import { useCallback, useContext, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { RowMenu } from "../screens/library/row-place.tsx";
import { useServices } from "../services/context.tsx";
import { OutlineContext } from "../state/bridge-contexts.ts";
import type { OutlineRow } from "../state/outline.store.ts";
import { SceneRowsContext, moveSceneTo } from "./moves.ts";
import type { SceneRowItem } from "./row-items.ts";

// what only a person who can edit is given, so that a reader's row draws no menu that would open empty
const EDITING_ITEMS: ReadonlySet<string> = new Set(["move"]);
const NO_ROWS: readonly OutlineRow[] = Object.freeze([]);

function useMoveRows(): readonly OutlineRow[] {
  const provided = useContext(SceneRowsContext);
  const outline = useContext(OutlineContext);
  const subscribe = useCallback(
    (listener: () => void) =>
      provided !== null || outline === null
        ? () => {}
        : outline.subscribe(listener),
    [provided, outline],
  );
  const cached = useRef<readonly OutlineRow[]>(NO_ROWS);
  const read = (): readonly OutlineRow[] => {
    if (provided !== null) return provided;
    if (outline === null) return NO_ROWS;
    const next: OutlineRow[] = [];
    for (let i = 0; i < outline.count(); i++) {
      const row = outline.row(i);
      if (row !== null) next.push(row);
    }
    const prev = cached.current;
    if (prev.length !== next.length || prev.some((row, at) => row !== next[at]))
      cached.current = next;
    return cached.current;
  };
  return useSyncExternalStore(subscribe, read, read);
}

/** Moves the scene immediately via its submenu (up, down, start, end), preceded by a structural separator. */
export function MoveItem(props: {
  docId: string;
  headingId: string;
}): ReactNode {
  const { docId, headingId } = props;
  const { messages } = useServices();
  const rows = useMoveRows();
  const index = rows.findIndex((row) => row.blockId === headingId);
  const movable = index !== -1 && rows[index]?.kind === "scene";
  const isFirst = !movable || index <= 0;
  const isLast = !movable || index >= rows.length - 1;
  const moveTo = (to: number): void => {
    if (!movable) return;
    moveSceneTo({ docId, rows, from: index, to, messages });
  };
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="text-ui">
          <ArrowUpDownIcon
            aria-hidden="true"
            className="size-icon text-fg-muted"
          />
          <span>{SCENE_MOVE_WORDS.move}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem
            className="text-ui"
            disabled={isFirst}
            onClick={() => moveTo(index - 1)}
          >
            <ArrowUpIcon
              aria-hidden="true"
              className="size-icon text-fg-muted"
            />
            <span>{SCENE_MOVE_WORDS.moveUp}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-ui"
            disabled={isLast}
            onClick={() => moveTo(index + 1)}
          >
            <ArrowDownIcon
              aria-hidden="true"
              className="size-icon text-fg-muted"
            />
            <span>{SCENE_MOVE_WORDS.moveDown}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-ui"
            disabled={isFirst}
            onClick={() => moveTo(0)}
          >
            <ArrowUpToLineIcon
              aria-hidden="true"
              className="size-icon text-fg-muted"
            />
            <span>{SCENE_MOVE_WORDS.moveToStart}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-ui"
            disabled={isLast}
            onClick={() => moveTo(rows.length - 1)}
          >
            <ArrowDownToLineIcon
              aria-hidden="true"
              className="size-icon text-fg-muted"
            />
            <span>{SCENE_MOVE_WORDS.moveToEnd}</span>
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
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
