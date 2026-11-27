// Sticky Episode column header on the Board: number badge, clickable title opening script/outline, stage chip, writer avatar, pages and beat count.
import type { EpisodeEntry } from "@manent/crdt";
import { COLOUR_NAMES, REVISION_COLOURS } from "@manent/revisions";
import type { RevisionColour } from "@manent/revisions";
import {
  Avatar,
  BOARD_WORDS,
  DropdownMenuItem,
  SERIES_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  formatCount,
} from "@manent/ui";
import {
  ArrowUpRightIcon,
  FileTextIcon,
  ListTreeIcon,
  LockIcon,
  NotebookPenIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { initialsOf } from "../../initials.ts";
import { RowMenu } from "../library/row-place.tsx";
import type { SeriesPerson } from "../library/series/series-facts.ts";
import type { BoardDensity } from "./board-view.ts";

function revisionColourFor(stage: string): RevisionColour | null {
  const lower = stage.toLowerCase();
  return (
    REVISION_COLOURS.find(
      (colour) => COLOUR_NAMES[colour].toLowerCase() === lower,
    ) ?? null
  );
}

export interface EpisodeHeaderProps {
  readonly episode: EpisodeEntry;
  readonly colIndex: number;
  readonly cardCount: number;
  readonly targetPages: number | null;
  readonly people: readonly SeriesPerson[];
  readonly density: BoardDensity;
  readonly focused: boolean;
  onOpenDoc(docId: string): void;
}

export function EpisodeHeader(props: EpisodeHeaderProps): ReactNode {
  const {
    episode,
    colIndex,
    cardCount,
    targetPages,
    people,
    density,
    focused,
    onOpenDoc,
  } = props;
  const title = episode.title ?? SERIES_WORDS.untitledEpisode;
  const primaryDocId = episode.docIds.script ?? episode.docIds.outline;
  const openTooltip =
    episode.docIds.script !== null
      ? BOARD_WORDS.openEpisodeScript(episode.number, title)
      : BOARD_WORDS.openEpisodeOutline(episode.number, title);

  const fallbackStage =
    episode.docIds.script === null && episode.docIds.outline !== null
      ? SERIES_WORDS.stages.outline
      : null;
  const stageText = episode.stage ?? fallbackStage;
  const revColour = stageText === null ? null : revisionColourFor(stageText);
  const writerName =
    episode.writerUserId === null
      ? null
      : (people.find((p) => p.userId === episode.writerUserId)?.name ?? null);
  const overTarget =
    episode.pages !== null &&
    targetPages !== null &&
    episode.pages > targetPages
      ? episode.pages - targetPages
      : 0;
  const hasAnyDoc =
    episode.docIds.script !== null ||
    episode.docIds.outline !== null ||
    episode.docIds.roomLog !== null;
  const showMetaRow = density !== "compact";

  return (
    <div
      data-episode-col={episode.id}
      data-locked={episode.locked ? "true" : undefined}
      data-focused-ep={focused ? "true" : undefined}
      style={{ gridColumn: colIndex + 2, gridRow: 1 }}
      className="mn-board-ep-head @container group/ep flex min-w-0 flex-col justify-center gap-1 px-2.5 py-2"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="mn-scene-num shrink-0">{episode.number}</span>
        {primaryDocId !== null ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => onOpenDoc(primaryDocId)}
                  className="group/ep-open flex min-h-6 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-control text-start text-ui font-semibold text-fg transition-colors duration-(--dur-fast) hover:text-fg-accent focus-visible:outline-2 focus-visible:outline-focus"
                />
              }
            >
              <span className="truncate">{title}</span>
              <ArrowUpRightIcon
                aria-hidden="true"
                className="size-3 shrink-0 text-fg-muted opacity-0 transition-opacity duration-(--dur-fast) group-hover/ep-open:opacity-100 group-focus-visible/ep-open:opacity-100"
              />
            </TooltipTrigger>
            <TooltipContent>{openTooltip}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="min-w-0 flex-1 truncate text-ui font-semibold text-fg">
            {title}
          </span>
        )}
        {episode.locked ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  role="img"
                  aria-label={BOARD_WORDS.episodeLocked}
                  className="inline-flex shrink-0 items-center text-fg-muted"
                />
              }
            >
              <LockIcon aria-hidden="true" className="size-3" />
            </TooltipTrigger>
            <TooltipContent>{BOARD_WORDS.episodeLocked}</TooltipContent>
          </Tooltip>
        ) : null}
        {!showMetaRow ? (
          <span
            className="shrink-0 text-micro text-fg-muted tabular-nums"
            title={BOARD_WORDS.cardCount(cardCount)}
          >
            {formatCount(cardCount)}
          </span>
        ) : null}
        {hasAnyDoc ? (
          <span className="shrink-0 opacity-0 transition-opacity duration-(--dur-fast) group-hover/ep:opacity-100 group-focus-within/ep:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100">
            <RowMenu title={BOARD_WORDS.episodeActions(episode.number, title)}>
              {episode.docIds.script !== null ? (
                <DropdownMenuItem
                  onClick={() => onOpenDoc(episode.docIds.script!)}
                >
                  <FileTextIcon
                    aria-hidden="true"
                    className="size-icon shrink-0"
                  />
                  <span>{BOARD_WORDS.openScript}</span>
                </DropdownMenuItem>
              ) : null}
              {episode.docIds.outline !== null ? (
                <DropdownMenuItem
                  onClick={() => onOpenDoc(episode.docIds.outline!)}
                >
                  <ListTreeIcon
                    aria-hidden="true"
                    className="size-icon shrink-0"
                  />
                  <span>{BOARD_WORDS.openOutline}</span>
                </DropdownMenuItem>
              ) : null}
              {episode.docIds.roomLog !== null ? (
                <DropdownMenuItem
                  onClick={() => onOpenDoc(episode.docIds.roomLog!)}
                >
                  <NotebookPenIcon
                    aria-hidden="true"
                    className="size-icon shrink-0"
                  />
                  <span>{BOARD_WORDS.openRoomLog}</span>
                </DropdownMenuItem>
              ) : null}
            </RowMenu>
          </span>
        ) : null}
      </div>

      {showMetaRow ? (
        <div className="flex min-w-0 items-center gap-1.5 text-micro text-fg-muted tabular-nums">
          {stageText !== null ? (
            <span className="mn-tag inline-flex max-w-28 items-center gap-1 truncate">
              {revColour !== null ? (
                <span
                  data-rev={revColour}
                  aria-hidden="true"
                  className="mn-rev-chip shrink-0"
                />
              ) : null}
              <span className="truncate">{stageText}</span>
            </span>
          ) : null}
          {writerName !== null ? (
            <Tooltip>
              <TooltipTrigger
                render={<span className="inline-flex shrink-0 items-center" />}
              >
                <Avatar
                  name={writerName}
                  initials={initialsOf(writerName)}
                  colour={null}
                  size="sm"
                />
              </TooltipTrigger>
              <TooltipContent>{writerName}</TooltipContent>
            </Tooltip>
          ) : null}
          {episode.pages !== null ? (
            <span className="inline-flex shrink-0 items-center gap-0.5">
              <span>{BOARD_WORDS.pagesCount(episode.pages)}</span>
              {overTarget > 0 ? (
                <span className="text-attention">
                  {SERIES_WORDS.changedCount(overTarget)}
                </span>
              ) : null}
            </span>
          ) : null}
          {episode.openCount !== null && episode.openCount.open > 0 ? (
            <span className="truncate text-attention">
              {SERIES_WORDS.draftOpen(
                episode.openCount.round,
                episode.openCount.open,
              )}
            </span>
          ) : null}
          <span
            className="ms-auto hidden shrink-0 @[12.5rem]:inline"
            title={BOARD_WORDS.cardCount(cardCount)}
          >
            {BOARD_WORDS.cardCount(cardCount)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
