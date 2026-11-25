// Comment/reply/note composer field with @mention autocomplete, offline fallback and keyboard submission.
import { Button, COMMENTS_WORDS, Skeleton, Textarea } from "@manent/ui";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { CommentPerson } from "./people-request.ts";

interface MentionMatch {
  readonly start: number;
  readonly end: number;
  readonly query: string;
}

const MENTION_TRIGGER = /(?:^|\s)@([^\s]*)$/;
const MENTION_SKELETON_WIDTHS = ["w-24", "w-32", "w-20"] as const;

function activeMention(text: string, caret: number): MentionMatch | null {
  const before = text.slice(0, caret);
  const match = MENTION_TRIGGER.exec(before);
  if (match === null) return null;
  const query = match[1] ?? "";
  const atPos = before.lastIndexOf("@");
  if (atPos === -1) return null;
  return { start: atPos, end: caret, query };
}

export function MentionField(props: {
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  mentions: boolean;
  people: readonly CommentPerson[];
  peopleState: "idle" | "loaded" | "offline";
  leadingAction?: ReactNode;
  onLoadPeople?: () => void;
  onSubmit(payload: {
    body: string;
    mentionedUserIds: readonly string[];
  }): boolean | void;
}): ReactNode {
  const {
    placeholder,
    submitLabel,
    autoFocus = false,
    mentions,
    people,
    peopleState,
    leadingAction,
    onLoadPeople,
    onSubmit,
  } = props;
  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [chosen, setChosen] = useState<readonly CommentPerson[]>([]);
  const [requested, setRequested] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const onLoadPeopleRef = useRef(onLoadPeople);
  onLoadPeopleRef.current = onLoadPeople;

  useEffect(() => {
    if (autoFocus) fieldRef.current?.focus();
  }, [autoFocus]);

  const mention = mentions && menuOpen ? activeMention(value, caret) : null;
  const query = mention?.query.toLowerCase() ?? "";
  const filtered =
    mention === null
      ? []
      : people.filter((p) => p.name.toLowerCase().includes(query));
  const hasLoader = onLoadPeople !== undefined;
  const mentionActive = mention !== null;

  useEffect(() => {
    if (peopleState !== "idle") {
      setRequested(false);
      return;
    }
    if (mentionActive && hasLoader) {
      setRequested(true);
      onLoadPeopleRef.current?.();
    }
  }, [mentionActive, hasLoader, peopleState]);

  const loadingPeople =
    hasLoader && requested && peopleState === "idle" && people.length === 0;

  const pickPerson = (person: CommentPerson): void => {
    if (mention === null) return;
    const token = COMMENTS_WORDS.mention(person.name);
    const next = `${value.slice(0, mention.start)}${token} ${value.slice(mention.end)}`;
    const nextCaret = mention.start + token.length + 1;
    setValue(next);
    setCaret(nextCaret);
    setMenuOpen(false);
    setSelectedIndex(0);
    setChosen((prev) =>
      prev.some((p) => p.userId === person.userId) ? prev : [...prev, person],
    );
    queueMicrotask(() => {
      const el = fieldRef.current;
      if (el !== null) {
        el.focus();
        el.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const submit = (): void => {
    const trimmed = value.trim();
    if (trimmed === "") return;
    const mentionedUserIds = chosen
      .filter((p) => trimmed.includes(COMMENTS_WORDS.mention(p.name)))
      .map((p) => p.userId);
    if (onSubmit({ body: trimmed, mentionedUserIds }) === false) return;
    setValue("");
    setCaret(0);
    setMenuOpen(false);
    setChosen([]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (mention !== null) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setMenuOpen(false);
        return;
      }
      if (event.key === "ArrowDown" && filtered.length > 0) {
        event.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (event.key === "ArrowUp" && filtered.length > 0) {
        event.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (
        (event.key === "Enter" || event.key === "Tab") &&
        filtered.length > 0
      ) {
        event.preventDefault();
        const picked = filtered[Math.min(selectedIndex, filtered.length - 1)];
        if (picked !== undefined) pickPerson(picked);
        return;
      }
    }
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="relative flex flex-col gap-2">
      {mention === null ? null : (
        <div
          role="listbox"
          aria-busy={loadingPeople || undefined}
          aria-label={placeholder}
          className="flex max-h-40 flex-col overflow-y-auto rounded-md bg-overlay p-1 text-ui shadow-overlay ring-1 ring-line"
        >
          {peopleState === "offline" && people.length === 0 ? (
            <p className="px-2 py-1 text-meta text-fg-muted">
              {COMMENTS_WORDS.peopleOffline}
            </p>
          ) : loadingPeople ? (
            <div className="flex flex-col gap-1 p-1">
              {MENTION_SKELETON_WIDTHS.map((width, index) => (
                <div
                  key={index}
                  aria-hidden="true"
                  className="flex items-center gap-2 px-1 py-1"
                >
                  <Skeleton className="size-avatar-sm shrink-0 rounded-full" />
                  <Skeleton className={`h-3 ${width}`} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-1 text-meta text-fg-muted">
              {COMMENTS_WORDS.noMatches}
            </p>
          ) : (
            filtered.map((person, index) => (
              <button
                key={person.userId}
                type="button"
                role="option"
                aria-selected={
                  index === Math.min(selectedIndex, filtered.length - 1)
                }
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickPerson(person);
                }}
                className={
                  index === Math.min(selectedIndex, filtered.length - 1)
                    ? "flex w-full cursor-pointer items-center rounded border-l-2 border-accent-solid bg-control px-2 py-1 text-left text-fg"
                    : "flex w-full cursor-pointer items-center rounded px-2 py-1 text-left text-fg hover:bg-subtle"
                }
              >
                {person.name}
              </button>
            ))
          )}
        </div>
      )}
      <Textarea
        ref={fieldRef}
        rows={2}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => {
          const next = event.target.value;
          const pos = event.target.selectionStart ?? next.length;
          setValue(next);
          setCaret(pos);
          setMenuOpen(mentions && activeMention(next, pos) !== null);
          setSelectedIndex(0);
        }}
        onSelect={(event) => {
          const pos = event.currentTarget.selectionStart ?? value.length;
          setCaret(pos);
        }}
        onKeyDown={onKeyDown}
        className="min-h-14 resize-none text-ui"
      />
      <div
        className={
          leadingAction !== undefined
            ? "flex items-center justify-between gap-2"
            : "flex justify-end"
        }
      >
        {leadingAction}
        <Button size="sm" disabled={value.trim() === ""} onClick={submit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
