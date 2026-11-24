// Inline typed Writer cell editor offering the project's people matched by first name or full name.
import { RUNDOWN_WORDS } from "@manent/ui";
import type { GridEditorContext } from "@manent/ui";
import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import type { RundownPerson } from "./rundown-access.ts";

/** Filters project people by first-name prefix or full-name substring. */
export function filterWriterPeople(
  people: readonly RundownPerson[],
  query: string,
): readonly RundownPerson[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return people;
  return people.filter((person) => {
    const first = person.name.split(" ")[0]?.toLowerCase() ?? "";
    return (
      first.startsWith(needle) || person.name.toLowerCase().includes(needle)
    );
  });
}

export function WriterEditor(props: {
  readonly context: GridEditorContext;
  readonly people: readonly RundownPerson[];
}): ReactNode {
  const { context, people } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  const [highlighted, setHighlighted] = useState(-1);
  const matches = filterWriterPeople(people, context.value);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    input.focus();
    if (context.initialKey === null) {
      input.select();
    } else {
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }
  }, [context.initialKey]);

  const pick = (
    name: string,
    direction: "down" | "right" | "left" | "none",
  ): void => {
    settled.current = true;
    context.onChange(name);
    context.onCommit(direction);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "ArrowDown" && matches.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      setHighlighted((i) => (i + 1) % matches.length);
      return;
    }
    if (event.key === "ArrowUp" && matches.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      setHighlighted((i) => (i <= 0 ? matches.length - 1 : i - 1));
      return;
    }
    if (
      event.key === "Enter" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      const chosen = matches[highlighted];
      if (chosen !== undefined) pick(chosen.name, "down");
      else {
        settled.current = true;
        context.onCommit("down");
      }
      return;
    }
    if (
      event.key === "Tab" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      const chosen = matches[highlighted];
      const dir = event.shiftKey ? "left" : "right";
      if (chosen !== undefined) pick(chosen.name, dir);
      else {
        settled.current = true;
        context.onCommit(dir);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      settled.current = true;
      context.onCancel();
      return;
    }
    event.stopPropagation();
  };

  return (
    <div className="relative w-full min-w-0">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-autocomplete="list"
        aria-label={RUNDOWN_WORDS.columns.writer}
        value={context.value}
        className="h-control-sm w-full min-w-0 rounded-control border border-line-strong bg-well px-2 text-ui font-normal text-fg outline-none"
        onChange={(event) => {
          setHighlighted(-1);
          context.onChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (settled.current) {
            settled.current = false;
            return;
          }
          context.onCommit("none");
        }}
      />
      {matches.length === 0 ? null : (
        <ul
          role="listbox"
          aria-label={RUNDOWN_WORDS.columns.writer}
          className="absolute start-0 top-full z-30 mt-1 max-h-48 min-w-full overflow-auto rounded-surface border border-line bg-overlay p-1 shadow-overlay"
        >
          {matches.map((person, index) => (
            <li
              key={person.userId}
              role="option"
              aria-selected={index === highlighted}
              className={
                index === highlighted
                  ? "flex min-h-row cursor-pointer items-center rounded-control bg-control px-2 text-ui whitespace-nowrap text-fg outline-2 -outline-offset-2 outline-focus"
                  : "flex min-h-row cursor-pointer items-center rounded-control px-2 text-ui whitespace-nowrap text-fg hover:bg-subtle"
              }
              onMouseDown={(event) => {
                event.preventDefault();
                pick(person.name, "none");
              }}
            >
              {person.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
