// The Find bar: a field, the count, previous, next, Replace and close; Replace gives way to a second field, which
// takes focus, and its buttons.
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { FIND_WORDS } from "../../words/navigation.ts";
import { Button } from "../stock/button.tsx";
import { Input } from "../stock/input.tsx";

export interface FindBarProps {
  readonly find: string;
  onFindChange(text: string): void;
  readonly count: number;
  /** The match the selection holds, from 1; null when it holds none. */
  readonly current: number | null;
  /** Each new value takes focus to the field and selects its text. */
  readonly focusKey: number;
  /** False for a person who cannot edit: Replace is not drawn. */
  readonly replaceable: boolean;
  onStep(direction: 1 | -1): void;
  onReplace(text: string): void;
  onReplaceAll(text: string): void;
  onClose(): void;
}

/** Enter, unless an input method is composing. */
const isEnter = (event: KeyboardEvent): boolean =>
  event.key === "Enter" &&
  !event.nativeEvent.isComposing &&
  event.keyCode !== 229;

function ReplaceFields(props: {
  disabled: boolean;
  onReplace(text: string): void;
  onReplaceAll(text: string): void;
}): ReactNode {
  const [text, setText] = useState("");
  return (
    <>
      <Input
        autoFocus
        aria-label={FIND_WORDS.replaceWith}
        placeholder={FIND_WORDS.replaceWith}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (!isEnter(event)) return;
          event.preventDefault();
          props.onReplace(text);
        }}
        className="h-control min-w-28 max-w-48 flex-1 text-ui"
      />
      <Button
        variant="outline"
        size="sm"
        disabled={props.disabled}
        onClick={() => props.onReplace(text)}
      >
        {FIND_WORDS.replace}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={props.disabled}
        onClick={() => props.onReplaceAll(text)}
      >
        {FIND_WORDS.replaceAll}
      </Button>
    </>
  );
}

/** Enter in the field goes to the next match, Shift+Enter to the previous one; the count is "No matches" when none. */
export function FindBar(props: FindBarProps): ReactNode {
  const { find, count, current, focusKey, onStep } = props;
  const [replacing, setReplacing] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, [focusKey]);
  return (
    <div
      role="search"
      className="flex min-h-findbar flex-wrap items-center gap-2 border-b border-line bg-chrome px-2 py-1 text-ui animate-in fade-in-0 duration-(--dur-fast) ease-out"
    >
      <Input
        ref={field}
        type="search"
        aria-label={FIND_WORDS.find}
        placeholder={FIND_WORDS.find}
        value={find}
        onChange={(event) => props.onFindChange(event.target.value)}
        onKeyDown={(event) => {
          if (!isEnter(event)) return;
          event.preventDefault();
          onStep(event.shiftKey ? -1 : 1);
        }}
        className="h-control min-w-32 max-w-60 flex-1 text-ui"
      />
      <span role="status" className="shrink-0 text-meta text-fg-muted">
        {find === "" ? null : FIND_WORDS.count(current, count)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={FIND_WORDS.previous}
        disabled={count === 0}
        onClick={() => onStep(-1)}
      >
        <ChevronUpIcon aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={FIND_WORDS.next}
        disabled={count === 0}
        onClick={() => onStep(1)}
      >
        <ChevronDownIcon aria-hidden="true" />
      </Button>
      {props.replaceable && !replacing ? (
        <Button variant="ghost" size="sm" onClick={() => setReplacing(true)}>
          {FIND_WORDS.replace}
        </Button>
      ) : null}
      {props.replaceable && replacing ? (
        <ReplaceFields
          disabled={count === 0}
          onReplace={props.onReplace}
          onReplaceAll={props.onReplaceAll}
        />
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={FIND_WORDS.close}
        onClick={props.onClose}
        className="ml-auto"
      >
        <XIcon
          aria-hidden="true"
          className="text-fg-muted group-hover/button:text-fg"
        />
      </Button>
    </div>
  );
}
