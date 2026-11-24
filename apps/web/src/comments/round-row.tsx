// A round filter row in the Comments tab, with Rename in its row menu for Can edit and owner.
import type { CommentRound } from "@manent/crdt";
import { COMMENTS_WORDS, DropdownMenuItem, Input } from "@manent/ui";
import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { RowMenu } from "../screens/library/row-place.tsx";
import { commentsActions } from "../state/comments.store.ts";
import { roundTitleLabel } from "./comments-format.ts";

export function RoundRow(props: {
  docId: string;
  roundId: string;
  round: CommentRound;
  selected: boolean;
  canEdit: boolean;
  onSelect(): void;
}): ReactNode {
  const { docId, roundId, round, selected, canEdit, onSelect } = props;
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(round.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const title = roundTitleLabel(round);

  useLayoutEffect(() => {
    if (!renaming) return;
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, [renaming]);

  const commit = (): void => {
    const trimmed = value.trim();
    if (trimmed !== "" && trimmed !== round.name) {
      commentsActions.renameRound(docId, roundId, trimmed);
    }
    setRenaming(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      setValue(round.name);
      setRenaming(false);
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  };

  if (renaming) {
    return (
      <div className="px-3 py-1">
        <Input
          ref={inputRef}
          aria-label={COMMENTS_WORDS.rename}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          className="h-control text-ui"
        />
      </div>
    );
  }

  return (
    <div
      className={
        selected
          ? "group flex items-center justify-between gap-1 rounded-md bg-selected px-2 py-1 text-ui text-fg"
          : "group flex items-center justify-between gap-1 rounded-md px-2 py-1 text-ui text-fg-muted hover:bg-subtle hover:text-fg"
      }
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="min-w-0 flex-1 truncate text-left"
      >
        {title}
      </button>
      {canEdit ? (
        <RowMenu title={title}>
          <DropdownMenuItem
            onClick={() => {
              setValue(round.name);
              setRenaming(true);
            }}
          >
            {COMMENTS_WORDS.rename}
          </DropdownMenuItem>
        </RowMenu>
      ) : null}
    </div>
  );
}
