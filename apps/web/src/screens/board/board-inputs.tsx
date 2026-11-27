// Framed inline composers on the Board: adding a storyline row or adding a card inside a cell, guarded against double commits.
import { BOARD_WORDS, Button, Input, Textarea } from "@manent/ui";
import { useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import type { StorylineTone } from "../../board/model.ts";

const keepFocus = (event: MouseEvent): void => event.preventDefault();

export function AddCardInput(props: {
  readonly ariaLabel?: string;
  readonly lane?: StorylineTone;
  onCommit(text: string): void;
  onCommitAndContinue?(text: string): void;
  onCancel(reason: "escape" | "blur" | "button"): void;
}): ReactNode {
  const { ariaLabel, lane, onCommit, onCommitAndContinue, onCancel } = props;
  const [draft, setDraft] = useState("");
  const settledRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const commit = (): void => {
    if (settledRef.current) return;
    settledRef.current = true;
    const trimmed = draft.trim();
    if (trimmed === "") onCancel("blur");
    else onCommit(trimmed);
  };

  const commitAndContinue = (): void => {
    if (settledRef.current) return;
    const trimmed = draft.trim();
    if (trimmed === "") return;
    if (onCommitAndContinue !== undefined) {
      onCommitAndContinue(trimmed);
      setDraft("");
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      commit();
    }
  };

  const cancel = (reason: "escape" | "blur" | "button"): void => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel(reason);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    event.stopPropagation();
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      commitAndContinue();
    } else if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel("escape");
    }
  };

  const trimmed = draft.trim();
  return (
    <div
      data-lane={lane}
      className="mn-card mn-board-card flex flex-col gap-1.5 border-focus"
    >
      <Textarea
        ref={inputRef}
        autoFocus
        rows={2}
        aria-label={ariaLabel ?? BOARD_WORDS.addCard}
        placeholder={BOARD_WORDS.cardPlaceholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className="min-h-0 resize-none p-2 text-ui"
      />
      <div className="flex items-center justify-end gap-1.5">
        <span className="me-auto hidden text-micro text-fg-muted sm:inline">
          {BOARD_WORDS.enterToAdd}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={keepFocus}
          onClick={() => cancel("button")}
        >
          {BOARD_WORDS.cancel}
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={trimmed === ""}
          onMouseDown={keepFocus}
          onClick={commit}
        >
          {BOARD_WORDS.add}
        </Button>
      </div>
    </div>
  );
}

export function AddStorylineInput(props: {
  readonly episodeCount: number;
  readonly rowIndex: number;
  readonly lane: StorylineTone;
  onCommit(title: string): void;
  onCancel(reason: "escape" | "blur" | "button"): void;
}): ReactNode {
  const { episodeCount, rowIndex, lane, onCommit, onCancel } = props;
  const [draft, setDraft] = useState("");
  const settledRef = useRef(false);

  const commit = (): void => {
    if (settledRef.current) return;
    settledRef.current = true;
    const trimmed = draft.trim();
    if (trimmed === "") onCancel("blur");
    else onCommit(trimmed);
  };

  const cancel = (reason: "escape" | "blur" | "button"): void => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel(reason);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel("escape");
    }
  };

  const trimmed = draft.trim();
  const gridRow = rowIndex + 2;
  return (
    <>
      <div
        data-lane={lane}
        style={{ gridColumn: 1, gridRow }}
        className="mn-board-rail flex flex-col gap-2 px-3 py-2.5"
      >
        <Input
          autoFocus
          aria-label={BOARD_WORDS.addStoryline}
          placeholder={BOARD_WORDS.storylinePlaceholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="h-control-sm w-full"
        />
        <div className="flex items-center justify-end gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onMouseDown={keepFocus}
            onClick={() => cancel("button")}
          >
            {BOARD_WORDS.cancel}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={trimmed === ""}
            onMouseDown={keepFocus}
            onClick={commit}
          >
            {BOARD_WORDS.add}
          </Button>
        </div>
      </div>
      {episodeCount > 0 ? (
        <div
          aria-hidden="true"
          style={{ gridColumn: `2 / span ${episodeCount}`, gridRow }}
          className="border-b border-e border-line bg-desk"
        />
      ) : null}
    </>
  );
}
