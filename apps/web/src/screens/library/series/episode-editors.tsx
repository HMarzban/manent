// In-place editors for the episode table's Ep, Title, Writer and Due cells.
import type { EpisodeEntry } from "@manent/crdt";
import {
  ASSIGNMENT_WORDS,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  SERIES_WORDS,
  cn,
  formatDate,
} from "@manent/ui";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import type { KeyboardEvent, ReactNode, SyntheticEvent } from "react";
import { fullNameOf } from "../../../services/sync/index-entries.ts";
import {
  COL_DUE,
  COL_EP,
  COL_TITLE,
  COL_WRITER,
  episodeDisplayTitle,
} from "./episode-cells.tsx";
import type { SeriesPerson } from "./series-facts.ts";

const stopRowEvent = (event: SyntheticEvent): void => event.stopPropagation();

const cellButtonClass =
  "cursor-pointer truncate rounded-control px-1 -mx-1 text-start hover:bg-subtle";

const toDateInput = (at: number): string => {
  const d = new Date(at);
  const y = String(d.getFullYear()).padStart(4, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const fromDateInput = (value: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match === null) return null;
  const ms = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  ).getTime();
  return Number.isSafeInteger(ms) ? ms : null;
};

export function EpCell(props: {
  episode: EpisodeEntry;
  canEdit: boolean;
  onSave(next: EpisodeEntry): void;
}): ReactNode {
  const { episode, canEdit, onSave } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const label = SERIES_WORDS.cellLabel(
    SERIES_WORDS.columns.ep,
    episodeDisplayTitle(episode),
  );
  const commit = (): void => {
    setEditing(false);
    const parsed = Number(draft.trim());
    if (
      Number.isSafeInteger(parsed) &&
      parsed > 0 &&
      parsed !== episode.number
    ) {
      onSave({ ...episode, number: parsed });
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === "Enter") commit();
    if (event.key === "Escape") setEditing(false);
  };
  if (editing) {
    return (
      <span className={COL_EP} onClick={stopRowEvent} onKeyDown={stopRowEvent}>
        <Input
          type="number"
          inputMode="numeric"
          aria-label={label}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="h-control-sm w-11 px-1 tabular-nums"
        />
      </span>
    );
  }
  if (!canEdit) {
    return (
      <span className={cn(COL_EP, "text-fg-muted")}>{episode.number}</span>
    );
  }
  return (
    <span className={COL_EP}>
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setDraft(String(episode.number));
          setEditing(true);
        }}
        onKeyDown={stopRowEvent}
        className={cn(cellButtonClass, "text-fg-muted tabular-nums")}
      >
        {episode.number}
      </button>
    </span>
  );
}

export function TitleCell(props: {
  episode: EpisodeEntry;
  canEdit: boolean;
  onSave(next: EpisodeEntry, titleText: string | null): void;
}): ReactNode {
  const { episode, canEdit, onSave } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const shown = episode.title ?? SERIES_WORDS.untitledEpisode;
  const label = SERIES_WORDS.cellLabel(
    SERIES_WORDS.columns.title,
    episodeDisplayTitle(episode),
  );
  const commit = (): void => {
    setEditing(false);
    const trimmed = draft.trim();
    const nextTitle = trimmed === "" ? null : trimmed;
    if (nextTitle !== episode.title) {
      onSave({ ...episode, title: nextTitle }, nextTitle);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === "Enter") commit();
    if (event.key === "Escape") setEditing(false);
  };
  if (editing) {
    return (
      <span
        className={COL_TITLE}
        onClick={stopRowEvent}
        onKeyDown={stopRowEvent}
      >
        <Input
          aria-label={label}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="h-control-sm w-full px-1"
        />
      </span>
    );
  }
  if (!canEdit) {
    return (
      <span className={cn(COL_TITLE, "truncate font-semibold")}>{shown}</span>
    );
  }
  return (
    <span className={cn(COL_TITLE, "flex items-center")}>
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setDraft(episode.title ?? "");
          setEditing(true);
        }}
        onKeyDown={stopRowEvent}
        className={cn(cellButtonClass, "max-w-full font-semibold")}
      >
        {shown}
      </button>
    </span>
  );
}

export function WriterCell(props: {
  episode: EpisodeEntry;
  canEdit: boolean;
  people: readonly SeriesPerson[];
  onSave(next: EpisodeEntry): void;
}): ReactNode {
  const { episode, canEdit, people, onSave } = props;
  const writerId = episode.writerUserId;
  const writerName =
    writerId === null
      ? null
      : (people.find((p) => p.userId === writerId)?.name ??
        fullNameOf(writerId));
  const shown = writerName ?? SERIES_WORDS.blank;
  const label = SERIES_WORDS.cellLabel(
    SERIES_WORDS.columns.writer,
    episodeDisplayTitle(episode),
  );
  if (!canEdit) {
    return (
      <span
        title={writerName ?? undefined}
        className={cn(COL_WRITER, "truncate text-meta text-fg-muted")}
      >
        {shown}
      </span>
    );
  }
  return (
    <span
      className={cn(COL_WRITER, "items-center")}
      onClick={stopRowEvent}
      onKeyDown={stopRowEvent}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={label}
              title={writerName ?? undefined}
              className={cn(
                cellButtonClass,
                "max-w-full text-meta text-fg-muted",
              )}
            />
          }
        >
          {shown}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {people.map((person) => (
            <DropdownMenuItem
              key={person.userId}
              onClick={() =>
                onSave({ ...episode, writerUserId: person.userId })
              }
            >
              <span className="flex-1 truncate">{person.name}</span>
              {writerId === person.userId ? (
                <CheckIcon aria-hidden="true" className="text-fg-accent" />
              ) : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onClick={() => onSave({ ...episode, writerUserId: null })}
          >
            <span className="flex-1 truncate">{ASSIGNMENT_WORDS.noWriter}</span>
            {writerId === null ? (
              <CheckIcon aria-hidden="true" className="text-fg-accent" />
            ) : null}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

export function DueCell(props: {
  episode: EpisodeEntry;
  canEdit: boolean;
  onSave(next: EpisodeEntry): void;
}): ReactNode {
  const { episode, canEdit, onSave } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const shown =
    episode.dueAt === null ? SERIES_WORDS.blank : formatDate(episode.dueAt);
  const label = SERIES_WORDS.cellLabel(
    SERIES_WORDS.columns.due,
    episodeDisplayTitle(episode),
  );
  const commit = (raw: string): void => {
    setEditing(false);
    const nextDue = raw.trim() === "" ? null : fromDateInput(raw);
    if (nextDue !== episode.dueAt) {
      onSave({ ...episode, dueAt: nextDue });
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === "Enter") commit(draft);
    if (event.key === "Escape") setEditing(false);
  };
  if (editing) {
    return (
      <span className={COL_DUE} onClick={stopRowEvent} onKeyDown={stopRowEvent}>
        <Input
          type="date"
          aria-label={label}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={onKeyDown}
          className="h-control-sm w-28 px-1 text-meta tabular-nums"
        />
      </span>
    );
  }
  if (!canEdit) {
    return (
      <span className={cn(COL_DUE, "items-center text-meta text-fg-muted")}>
        {shown}
      </span>
    );
  }
  return (
    <span className={cn(COL_DUE, "items-center")}>
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setDraft(episode.dueAt === null ? "" : toDateInput(episode.dueAt));
          setEditing(true);
        }}
        onKeyDown={stopRowEvent}
        className={cn(cellButtonClass, "text-meta text-fg-muted tabular-nums")}
      >
        {shown}
      </button>
    </span>
  );
}
