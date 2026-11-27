// Single-cell footer on the Board: collapsed summary pill, framed AddCardInput, or hover-revealed + Add card trigger.
import type { EpisodeEntry } from "@manent/crdt";
import { BOARD_WORDS, Button, SERIES_WORDS } from "@manent/ui";
import { PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { BoardStoryline, StorylineTone } from "../../board/model.ts";
import { AddCardInput } from "./board-inputs.tsx";

export function BoardCellFooter(props: {
  readonly storyline: BoardStoryline;
  readonly episode: EpisodeEntry;
  readonly lane: StorylineTone;
  readonly collapsed: boolean;
  readonly cellCardCount: number;
  readonly canEdit: boolean;
  readonly isAdding: boolean;
  onToggleCollapse(): void;
  onStartAdd(): void;
  onCommitAdd(text: string): void;
  onCommitAddAndContinue?(text: string): void;
  onCancelAdd(reason: "escape" | "blur" | "button"): void;
}): ReactNode {
  const {
    storyline,
    episode,
    lane,
    collapsed,
    cellCardCount,
    canEdit,
    isAdding,
    onToggleCollapse,
    onStartAdd,
    onCommitAdd,
    onCommitAddAndContinue,
    onCancelAdd,
  } = props;

  if (collapsed) {
    if (cellCardCount === 0) {
      return (
        <span
          aria-hidden="true"
          className="px-1 text-micro text-fg-muted select-none"
        >
          {SERIES_WORDS.blank}
        </span>
      );
    }
    return (
      <button
        type="button"
        data-collapsed-expand=""
        onClick={onToggleCollapse}
        className="inline-flex min-h-6 cursor-pointer items-center gap-1.5 self-start rounded-control border border-line bg-raised px-2 py-0.5 text-micro text-fg tabular-nums transition-colors duration-(--dur-fast) hover:border-line-strong hover:bg-subtle"
      >
        <span
          aria-hidden="true"
          data-lane={lane}
          className="mn-board-lane-dot"
        />
        <span>{BOARD_WORDS.cardCount(cellCardCount)}</span>
      </button>
    );
  }

  if (isAdding) {
    return (
      <AddCardInput
        ariaLabel={BOARD_WORDS.addCardInCell(storyline.title, episode.number)}
        lane={lane}
        onCommit={onCommitAdd}
        onCommitAndContinue={onCommitAddAndContinue}
        onCancel={onCancelAdd}
      />
    );
  }

  if (!canEdit) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      data-tour="board.addCard"
      aria-label={BOARD_WORDS.addCardInCell(storyline.title, episode.number)}
      onClick={onStartAdd}
      className="mn-board-add-trigger w-full cursor-pointer justify-start text-fg-muted hover:text-fg"
    >
      <PlusIcon
        aria-hidden="true"
        data-icon="inline-start"
        className="size-icon"
      />
      {BOARD_WORDS.addCard}
    </Button>
  );
}
