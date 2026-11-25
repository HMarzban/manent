// Inline composers on the Board: adding a storyline row or adding a card inside a cell.
import { BOARD_WORDS, Input, Textarea } from "@manent/ui";
import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export function AddCardInput(props: {
  onCommit(text: string): void;
  onCancel(): void;
}): ReactNode {
  const { onCommit, onCancel } = props;
  const [draft, setDraft] = useState("");
  const submit = (): void => {
    const trimmed = draft.trim();
    if (trimmed === "") onCancel();
    else onCommit(trimmed);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    event.stopPropagation();
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };
  return (
    <Textarea
      autoFocus
      rows={2}
      aria-label={BOARD_WORDS.addCard}
      placeholder={BOARD_WORDS.cardPlaceholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={submit}
      onKeyDown={onKeyDown}
      className="min-h-0 resize-none p-2 text-ui"
    />
  );
}

export function AddStorylineInput(props: {
  columnSpan: number;
  onCommit(title: string): void;
  onCancel(): void;
}): ReactNode {
  const { columnSpan, onCommit, onCancel } = props;
  const [draft, setDraft] = useState("");
  const submit = (): void => {
    const trimmed = draft.trim();
    if (trimmed === "") onCancel();
    else onCommit(trimmed);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };
  return (
    <div
      style={{ gridColumn: `1 / span ${columnSpan}` }}
      className="border-t border-line bg-chrome px-3 py-2"
    >
      <Input
        autoFocus
        aria-label={BOARD_WORDS.addStoryline}
        placeholder={BOARD_WORDS.storylinePlaceholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={submit}
        onKeyDown={onKeyDown}
        className="max-w-popover"
      />
    </div>
  );
}
