// In-place editors for the episode table's Ep and Title cells (click opens script/outline, F2/menu/double-click renames, lock & secondary doc cues).
import type { EpisodeEntry } from "@manent/crdt";
import {
  Button,
  Input,
  SERIES_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@manent/ui";
import {
  ArrowUpRightIcon,
  ListTreeIcon,
  LockIcon,
  NotebookPenIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { KeyboardEvent, ReactNode, SyntheticEvent } from "react";
import { COL_EP, COL_TITLE, episodeDisplayTitle } from "./episode-cells.tsx";

export { DueCell, WriterCell } from "./episode-meta-editors.tsx";

const stopRowEvent = (event: SyntheticEvent): void => event.stopPropagation();

const cellButtonClass =
  "inline-flex min-h-6 cursor-pointer items-center truncate rounded-control px-1 -mx-1 text-start transition-colors duration-(--dur-fast) hover:bg-subtle focus-visible:outline-2 focus-visible:outline-focus";

export function EpCell(props: {
  episode: EpisodeEntry;
  canEdit: boolean;
  editing: boolean;
  onEditingChange(next: boolean): void;
  onSave(next: EpisodeEntry): void;
}): ReactNode {
  const { episode, canEdit, editing, onEditingChange, onSave } = props;
  const [draft, setDraft] = useState(String(episode.number));
  useEffect(() => {
    if (editing) setDraft(String(episode.number));
  }, [editing, episode.number]);

  const label = SERIES_WORDS.cellLabel(
    SERIES_WORDS.columns.ep,
    episodeDisplayTitle(episode),
  );
  const commit = (): void => {
    onEditingChange(false);
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
    if (event.key === "Escape") onEditingChange(false);
  };
  if (editing && canEdit) {
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
          onEditingChange(true);
        }}
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
  editing: boolean;
  primaryDocId: string | null;
  onEditingChange(next: boolean): void;
  onOpenDoc(docId: string): void;
  onSave(next: EpisodeEntry, titleText: string | null): void;
}): ReactNode {
  const {
    episode,
    canEdit,
    editing,
    primaryDocId,
    onEditingChange,
    onOpenDoc,
    onSave,
  } = props;
  const [draft, setDraft] = useState(episode.title ?? "");
  useEffect(() => {
    if (editing) setDraft(episode.title ?? "");
  }, [editing, episode.title]);

  const shown = episode.title ?? SERIES_WORDS.untitledEpisode;
  const label = SERIES_WORDS.cellLabel(
    SERIES_WORDS.columns.title,
    episodeDisplayTitle(episode),
  );
  const commit = (): void => {
    onEditingChange(false);
    const trimmed = draft.trim();
    const nextTitle = trimmed === "" ? null : trimmed;
    if (nextTitle !== episode.title) {
      onSave({ ...episode, title: nextTitle }, nextTitle);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === "Enter") commit();
    if (event.key === "Escape") onEditingChange(false);
  };
  if (editing && canEdit) {
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
  const hasSecondaryOutline =
    episode.docIds.script !== null && episode.docIds.outline !== null;
  const hasRoomLog = episode.docIds.roomLog !== null;

  return (
    <span className={cn(COL_TITLE, "flex items-center gap-1.5")}>
      {primaryDocId !== null ? (
        <button
          type="button"
          onClick={() => onOpenDoc(primaryDocId)}
          onDoubleClick={
            canEdit
              ? (e) => {
                  e.stopPropagation();
                  onEditingChange(true);
                }
              : undefined
          }
          onKeyDown={(e) => {
            if (e.key === "F2" && canEdit) {
              e.preventDefault();
              onEditingChange(true);
            }
          }}
          className="group/ep-open -mx-1 inline-flex min-h-6 min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-control px-1 text-start font-semibold text-fg transition-colors duration-(--dur-fast) hover:text-fg-accent focus-visible:outline-2 focus-visible:outline-focus"
        >
          <span className="truncate">{shown}</span>
          <ArrowUpRightIcon
            aria-hidden="true"
            className="size-3 shrink-0 text-fg-muted opacity-0 transition-opacity duration-(--dur-fast) group-hover/ep-open:opacity-100 group-focus-visible/ep-open:opacity-100"
          />
        </button>
      ) : (
        <span className="truncate font-semibold text-fg">{shown}</span>
      )}
      {episode.locked ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                role="img"
                aria-label={SERIES_WORDS.pagesLocked}
                className="inline-flex shrink-0 items-center text-fg-muted"
              />
            }
          >
            <LockIcon aria-hidden="true" className="size-3" />
          </TooltipTrigger>
          <TooltipContent>{SERIES_WORDS.pagesLocked}</TooltipContent>
        </Tooltip>
      ) : null}
      {hasSecondaryOutline ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={SERIES_WORDS.openOutline}
                onClick={() => onOpenDoc(episode.docIds.outline!)}
                className="shrink-0 text-fg-muted hover:text-fg"
              />
            }
          >
            <ListTreeIcon aria-hidden="true" className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{SERIES_WORDS.openOutline}</TooltipContent>
        </Tooltip>
      ) : null}
      {hasRoomLog ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={SERIES_WORDS.openRoomLog}
                onClick={() => onOpenDoc(episode.docIds.roomLog!)}
                className="shrink-0 text-fg-muted hover:text-fg"
              />
            }
          >
            <NotebookPenIcon aria-hidden="true" className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{SERIES_WORDS.openRoomLog}</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}
