// One storyline's row header on the Board: its title, inline rename, and row menu (Rename, Remove).
import {
  BOARD_WORDS,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Input,
} from "@manent/ui";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { BoardStoryline } from "../../board/model.ts";
import { RowMenu } from "../library/row-place.tsx";

export interface StorylineHeaderProps {
  readonly storyline: BoardStoryline;
  readonly rowStart: number;
  readonly isLast: boolean;
  readonly canEdit: boolean;
  onRename(title: string): void;
  onRemove(): void;
}

export function StorylineHeader(props: StorylineHeaderProps): ReactNode {
  const { storyline, rowStart, isLast, canEdit, onRename, onRemove } = props;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");

  const startRename = (): void => {
    if (!canEdit) return;
    setDraft(storyline.title);
    setRenaming(true);
  };

  const commit = (): void => {
    setRenaming(false);
    const trimmed = draft.trim();
    if (trimmed !== "" && trimmed !== storyline.title) onRename(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setRenaming(false);
    }
  };

  const menuItems = (
    <>
      <DropdownMenuItem onClick={startRename}>
        <PencilIcon aria-hidden="true" className="size-icon shrink-0" />
        {BOARD_WORDS.rename}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={onRemove}>
        <Trash2Icon aria-hidden="true" className="size-icon shrink-0" />
        {BOARD_WORDS.remove}
      </DropdownMenuItem>
    </>
  );

  const cell = (
    <div
      style={{ gridColumn: 1, gridRow: `${rowStart} / span 2` }}
      className={`group/storyline flex items-start justify-between gap-2 bg-chrome px-3 py-2${isLast ? "" : " border-b border-line"}`}
    >
      {renaming && canEdit ? (
        <Input
          autoFocus
          aria-label={BOARD_WORDS.rename}
          placeholder={BOARD_WORDS.storylinePlaceholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="h-control-sm w-full"
        />
      ) : (
        <span
          className="min-w-0 flex-1 text-ui font-semibold break-words text-fg"
          onDoubleClick={canEdit ? startRename : undefined}
        >
          {storyline.title}
        </span>
      )}
      {canEdit && !renaming ? (
        <span className="opacity-0 transition-opacity duration-(--dur-fast) group-hover/storyline:opacity-100 group-focus-within/storyline:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100">
          <RowMenu title={storyline.title}>{menuItems}</RowMenu>
        </span>
      ) : null}
    </div>
  );

  if (!canEdit || renaming) return cell;
  return (
    <ContextMenu>
      <ContextMenuTrigger render={cell} />
      <ContextMenuContent>{menuItems}</ContextMenuContent>
    </ContextMenu>
  );
}
