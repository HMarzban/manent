// The palette's interactive ask step: filters a list of choices or reads a line of free text.
import { SearchIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { keyLabel } from "../commands-react/key-labels.ts";
import { Kbd } from "../components/stock/kbd.tsx";
import { PALETTE_WORDS } from "../words/palette.ts";
import { matchedRuns, matchesQuery } from "./palette-rank.ts";

export interface PaletteAsk {
  readonly prompt: string;
  /** Null for a free-text prompt; a list of choices to filter and choose from otherwise. */
  readonly choices: readonly string[] | null;
  readonly initial: string;
  submit(value: string): void;
}

export interface PaletteAskViewProps {
  readonly ask: PaletteAsk;
  onClose(): void;
}

const OPENER = '[data-tour="app.palette"]';

function useOutsidePress(
  surface: RefObject<HTMLElement | null>,
  close: () => void,
): void {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest(OPENER) !== null) return;
      if (target instanceof Node && surface.current?.contains(target)) return;
      latest.current();
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
  }, [surface]);
}

function matchesChoice(query: string, choice: string): boolean {
  const trimmed = query.trim().toLocaleLowerCase();
  if (trimmed === "") return true;
  return (
    choice.toLocaleLowerCase().includes(trimmed) ||
    matchesQuery(query, [choice])
  );
}

function choiceRuns(
  query: string,
  choice: string,
): { text: string; matched: boolean }[] {
  const runs = matchedRuns(query, choice);
  if (runs.some((run) => run.matched)) return runs;
  const trimmed = query.trim();
  if (trimmed === "") return [{ text: choice, matched: false }];
  const at = choice.toLocaleLowerCase().indexOf(trimmed.toLocaleLowerCase());
  if (at < 0) return [{ text: choice, matched: false }];
  return [
    ...(at > 0 ? [{ text: choice.slice(0, at), matched: false }] : []),
    { text: choice.slice(at, at + trimmed.length), matched: true },
    ...(at + trimmed.length < choice.length
      ? [{ text: choice.slice(at + trimmed.length), matched: false }]
      : []),
  ];
}

function KeyHint(props: {
  readonly keys: readonly string[];
  readonly word: string;
}): ReactNode {
  return (
    <span className="flex items-center gap-1">
      {props.keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      <span className="text-meta text-fg-muted">{props.word}</span>
    </span>
  );
}

function AskFooter(props: {
  readonly hasChoices: boolean;
  readonly canSubmit: boolean;
}): ReactNode {
  const { hasChoices, canSubmit } = props;
  return (
    <div
      aria-hidden="true"
      className="flex min-h-row shrink-0 items-center gap-4 border-t border-line px-3 @max-[30rem]:hidden pointer-coarse:hidden"
    >
      {hasChoices ? (
        <KeyHint
          keys={[keyLabel("ArrowUp", "mac"), keyLabel("ArrowDown", "mac")]}
          word={PALETTE_WORDS.keys.move}
        />
      ) : null}
      {canSubmit ? (
        <KeyHint
          keys={[keyLabel("Enter", "mac")]}
          word={PALETTE_WORDS.keys.choose}
        />
      ) : null}
      <KeyHint
        keys={[keyLabel("Escape", "mac")]}
        word={PALETTE_WORDS.keys.close}
      />
    </div>
  );
}

/** The palette's ask step: prompts for a filtered choice or free-text value and submits it. */
export function PaletteAskView(props: PaletteAskViewProps): ReactNode {
  const { ask, onClose } = props;
  const [prevAsk, setPrevAsk] = useState(ask);
  const [value, setValue] = useState(ask.initial);
  const [activeIndex, setActiveIndex] = useState(0);
  if (prevAsk !== ask) {
    setPrevAsk(ask);
    setValue(ask.initial);
    setActiveIndex(0);
  }
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const surface = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useOutsidePress(surface, onClose);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    input.focus();
    if (ask.initial !== "") input.select();
  }, [ask]);

  const { choices } = ask;
  const filtered = useMemo(
    () =>
      choices === null
        ? []
        : choices.filter((choice) => matchesChoice(value, choice)),
    [choices, value],
  );
  const highlighted =
    filtered.length === 0 ? -1 : Math.min(activeIndex, filtered.length - 1);

  useEffect(() => {
    if (highlighted < 0) return;
    const option = listRef.current?.children[highlighted];
    if (
      option instanceof HTMLElement &&
      typeof option.scrollIntoView === "function"
    )
      option.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  const submitValue = (chosen: string): void => {
    // close before submitting so a chained paletteActions.ask(...) opens cleanly
    onClose();
    ask.submit(chosen);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (choices !== null) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (filtered.length > 0)
          setActiveIndex((current) => (current + 1) % filtered.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (filtered.length > 0)
          setActiveIndex(
            (current) => (current - 1 + filtered.length) % filtered.length,
          );
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const chosen = filtered[highlighted];
        if (chosen !== undefined) submitValue(chosen);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const trimmed = value.trim();
      if (trimmed !== "") submitValue(trimmed);
    }
  };

  const isChoices = choices !== null;
  const canSubmit = isChoices ? filtered.length > 0 : value.trim() !== "";

  return (
    <div
      ref={surface}
      className="@container fixed inset-x-0 mx-auto flex flex-col overflow-hidden rounded-surface border border-line bg-overlay shadow-dialog"
      style={{
        zIndex: "var(--z-overlay)",
        top: "12vh",
        width: "min(var(--palette-w), 100% - 2rem)",
        maxHeight: "min(var(--palette-max-h), 100dvh - 12vh - 1rem)",
      }}
    >
      <div className="flex shrink-0 flex-col border-b border-line px-3 pt-2 pb-1">
        <label
          htmlFor={inputId}
          className="text-meta font-medium text-fg-muted"
        >
          {ask.prompt}
        </label>
        <div className="flex h-control items-center gap-2">
          {isChoices ? (
            <SearchIcon
              aria-hidden="true"
              className="size-icon-lg shrink-0 text-fg-muted"
            />
          ) : null}
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            aria-label={ask.prompt}
            role={isChoices ? "combobox" : undefined}
            aria-expanded={isChoices ? true : undefined}
            aria-controls={isChoices ? listId : undefined}
            aria-autocomplete={isChoices ? "list" : undefined}
            aria-activedescendant={
              isChoices && highlighted >= 0
                ? `${listId}-${highlighted}`
                : undefined
            }
            className="mn-palette-field h-full min-w-0 flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-muted"
          />
        </div>
      </div>
      {isChoices && filtered.length === 0 ? (
        <div role="status" className="px-3 py-3 text-ui text-fg-muted">
          {PALETTE_WORDS.noMatch(value)}
        </div>
      ) : null}
      {isChoices && filtered.length > 0 ? (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ask.prompt}
          className="min-h-0 flex-1 overflow-auto p-1"
        >
          {filtered.map((choice, index) => (
            <div
              key={`${index}\0${choice}`}
              id={`${listId}-${index}`}
              role="option"
              data-highlighted={index === highlighted ? "" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => submitValue(choice)}
              className="mn-row flex min-h-row items-center gap-2 px-2 text-ui text-fg"
            >
              <span className="min-w-0 flex-1 truncate">
                {choiceRuns(value, choice).map((run, at) =>
                  run.matched ? (
                    <span key={at} className="font-semibold">
                      {run.text}
                    </span>
                  ) : (
                    run.text
                  ),
                )}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <AskFooter
        hasChoices={isChoices && filtered.length > 0}
        canSubmit={canSubmit}
      />
    </div>
  );
}
