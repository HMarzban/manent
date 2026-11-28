// In-place dropdown/popover editors for the episode table's Writer (with Avatar) and Due (popover date picker + urgency) cells.
import type { EpisodeEntry } from "@manent/crdt";
import {
  ASSIGNMENT_WORDS,
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SERIES_WORDS,
  cn,
  formatDate,
} from "@manent/ui";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { initialsOf } from "../../../initials.ts";
import { fullNameOf } from "../../../services/sync/index-entries.ts";
import { COL_DUE, COL_WRITER, episodeDisplayTitle } from "./episode-cells.tsx";
import { dueUrgency } from "./series-facts.ts";
import type { SeriesPerson } from "./series-facts.ts";

const cellButtonClass =
  "inline-flex min-h-6 cursor-pointer items-center truncate rounded-control px-1 -mx-1 text-start transition-colors duration-(--dur-fast) hover:bg-subtle focus-visible:outline-2 focus-visible:outline-focus";

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
  const inner = (
    <>
      {writerName !== null ? (
        <Avatar
          name={writerName}
          initials={initialsOf(writerName)}
          colour={null}
          size="sm"
        />
      ) : null}
      <span className="truncate">{shown}</span>
    </>
  );
  if (!canEdit) {
    return (
      <span
        title={writerName ?? undefined}
        className={cn(
          COL_WRITER,
          "items-center gap-1.5 text-meta text-fg-muted",
        )}
      >
        {inner}
      </span>
    );
  }
  return (
    <span className={cn(COL_WRITER, "items-center")}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={label}
              title={writerName ?? undefined}
              className={cn(
                cellButtonClass,
                "max-w-full gap-1.5 text-meta text-fg-muted hover:text-fg",
              )}
            />
          }
        >
          {inner}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {people.map((person) => (
            <DropdownMenuItem
              key={person.userId}
              onClick={() =>
                onSave({ ...episode, writerUserId: person.userId })
              }
            >
              <Avatar
                name={person.name}
                initials={initialsOf(person.name)}
                colour={null}
                size="sm"
              />
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
  now: number;
  onSave(next: EpisodeEntry): void;
}): ReactNode {
  const { episode, canEdit, now, onSave } = props;
  const [open, setOpen] = useState(false);
  const shown =
    episode.dueAt === null ? SERIES_WORDS.blank : formatDate(episode.dueAt);
  const urgency = dueUrgency(episode.dueAt, now);
  const toneClass =
    urgency === "overdue"
      ? "text-danger"
      : urgency === "soon"
        ? "text-attention"
        : "text-fg-muted";
  const urgencyTitle =
    urgency === "overdue"
      ? SERIES_WORDS.dueOverdue
      : urgency === "soon"
        ? SERIES_WORDS.dueSoon
        : undefined;
  const label = SERIES_WORDS.cellLabel(
    SERIES_WORDS.columns.due,
    episodeDisplayTitle(episode),
  );

  if (!canEdit) {
    return (
      <span
        title={urgencyTitle}
        className={cn(COL_DUE, "items-center text-meta", toneClass)}
      >
        {shown}
      </span>
    );
  }
  return (
    <span className={cn(COL_DUE, "items-center")}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={label}
              title={urgencyTitle}
              className={cn(
                cellButtonClass,
                "text-meta tabular-nums",
                toneClass,
              )}
            />
          }
        >
          {shown}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="flex w-52 flex-col gap-2 p-2.5"
        >
          <Input
            type="date"
            aria-label={label}
            value={episode.dueAt === null ? "" : toDateInput(episode.dueAt)}
            onChange={(e) => {
              const nextDue =
                e.target.value.trim() === ""
                  ? null
                  : fromDateInput(e.target.value);
              if (nextDue !== episode.dueAt) {
                onSave({ ...episode, dueAt: nextDue });
              }
              setOpen(false);
            }}
            className="h-control-sm text-meta tabular-nums"
          />
          {episode.dueAt !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onSave({ ...episode, dueAt: null });
                setOpen(false);
              }}
              className="w-full cursor-pointer justify-start text-meta text-fg-muted hover:text-fg"
            >
              {SERIES_WORDS.clearDue}
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </span>
  );
}
