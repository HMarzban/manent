// Column widths and episode cells: interactive Stage picker (with revision chip & attention open count), Pages (with target bar & ▲N) and Last edited.
import type { EpisodeEntry } from "@manent/crdt";
import { COLOUR_NAMES, REVISION_COLOURS } from "@manent/revisions";
import type { RevisionColour } from "@manent/revisions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LIBRARY_WORDS,
  SERIES_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  formatCount,
  formatWhen,
} from "@manent/ui";
import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { EpisodeLastEdited } from "./series-facts.ts";

export const COL_EP = "w-10 shrink-0 tabular-nums";
export const COL_TITLE = "min-w-0 flex-1";
export const COL_WRITER = "hidden w-28 shrink-0 @2xl:flex";
export const COL_STAGE = "hidden w-28 shrink-0 @lg:flex";
export const COL_DUE = "hidden w-15 shrink-0 tabular-nums @3xl:flex";
export const COL_PAGES = "hidden w-16 shrink-0 pe-2 mn-num @xl:flex";
export const COL_EDITED = "hidden w-28 shrink-0 @[52rem]:flex";
export const COL_PLACE = "w-28 shrink-0";
export const COL_MENU = "w-6 shrink-0";

const DEFAULT_STAGES: readonly string[] = [
  SERIES_WORDS.stages.outline,
  SERIES_WORDS.stages.board,
  SERIES_WORDS.stages.writersFirst,
  SERIES_WORDS.stages.studio,
  SERIES_WORDS.stages.network,
  SERIES_WORDS.stages.white,
];

export function revisionColourFor(stage: string): RevisionColour | null {
  const lower = stage.toLowerCase();
  return (
    REVISION_COLOURS.find(
      (colour) => COLOUR_NAMES[colour].toLowerCase() === lower,
    ) ?? null
  );
}

export function episodeDisplayTitle(episode: EpisodeEntry): string {
  const title = episode.title ?? SERIES_WORDS.untitledEpisode;
  return `${episode.number} ${title}`;
}

export function resolvedEpisodeStage(episode: EpisodeEntry): string | null {
  const fallback =
    episode.docIds.script === null && episode.docIds.outline !== null
      ? SERIES_WORDS.stages.outline
      : null;
  return episode.stage ?? fallback;
}

export function StageCell(props: {
  readonly episode: EpisodeEntry;
  readonly canEdit?: boolean;
  readonly ladder?: readonly string[];
  onSave?(next: EpisodeEntry): void;
}): ReactNode {
  const { episode, canEdit = false, ladder = [], onSave } = props;
  const { openCount } = episode;
  const baseStage = resolvedEpisodeStage(episode);
  const revColour = baseStage === null ? null : revisionColourFor(baseStage);
  const hasOpen = openCount !== null && openCount.open > 0;
  let text: string = SERIES_WORDS.blank;
  if (hasOpen) {
    text = SERIES_WORDS.draftOpen(baseStage ?? openCount.round, openCount.open);
  } else if (baseStage !== null) {
    text = baseStage;
  }

  const content = (
    <>
      {revColour === null ? null : (
        <span
          data-rev={revColour}
          aria-hidden="true"
          className="mn-rev-chip shrink-0"
        />
      )}
      <span className={cn("truncate", hasOpen ? "text-attention" : undefined)}>
        {text}
      </span>
    </>
  );

  if (!canEdit || onSave === undefined) {
    return (
      <span
        title={text}
        className={cn(
          COL_STAGE,
          "items-center gap-1.5 text-meta text-fg-muted",
        )}
      >
        {content}
      </span>
    );
  }

  const options = [
    ...new Set([
      SERIES_WORDS.stages.outline,
      SERIES_WORDS.stages.board,
      ...(ladder.length > 0 ? ladder : DEFAULT_STAGES),
      ...(baseStage !== null ? [baseStage] : []),
    ]),
  ];
  const label = SERIES_WORDS.cellLabel(
    SERIES_WORDS.columns.stage,
    episodeDisplayTitle(episode),
  );

  return (
    <span className={cn(COL_STAGE, "items-center")}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={label}
              title={text}
              className="-mx-1 inline-flex min-h-6 max-w-full cursor-pointer items-center gap-1.5 rounded-control px-1 text-start text-meta text-fg-muted transition-colors duration-(--dur-fast) hover:bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
            />
          }
        >
          {content}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {options.map((stage) => {
            const chip = revisionColourFor(stage);
            return (
              <DropdownMenuItem
                key={stage}
                onClick={() => onSave({ ...episode, stage })}
              >
                {chip !== null ? (
                  <span
                    data-rev={chip}
                    aria-hidden="true"
                    className="mn-rev-chip shrink-0"
                  />
                ) : null}
                <span className="flex-1 truncate">{stage}</span>
                {episode.stage === stage ? (
                  <CheckIcon aria-hidden="true" className="text-fg-accent" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
          {episode.stage !== null ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onSave({ ...episode, stage: null })}
              >
                <span className="flex-1 truncate">
                  {SERIES_WORDS.clearStage}
                </span>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

export function PagesCell(props: {
  episode: EpisodeEntry;
  targetPages: number | null;
}): ReactNode {
  const { episode, targetPages } = props;
  if (episode.pages === null) {
    return (
      <span className={cn(COL_PAGES, "items-center text-meta text-fg-muted")}>
        {SERIES_WORDS.blank}
      </span>
    );
  }
  const over =
    targetPages !== null && episode.pages > targetPages
      ? episode.pages - targetPages
      : 0;
  const ratio =
    targetPages !== null && targetPages > 0
      ? Math.min(1, episode.pages / targetPages)
      : null;

  const cell = (
    <span
      className={cn(COL_PAGES, "flex-col items-end justify-center gap-0.5")}
    >
      <span className="flex items-center justify-end gap-1 text-meta text-fg">
        <span>{formatCount(episode.pages)}</span>
        {over > 0 ? (
          <span className="text-attention">
            {SERIES_WORDS.changedCount(over)}
          </span>
        ) : null}
      </span>
      {ratio !== null ? (
        <span aria-hidden="true" className="mn-progress-track h-0.5 w-12">
          <span
            data-over={over > 0 ? "true" : undefined}
            style={{ transform: `scaleX(${ratio})` }}
            className={cn(
              "mn-progress-fill",
              over > 0 ? "bg-attention!" : undefined,
            )}
          />
        </span>
      ) : null}
    </span>
  );

  if (targetPages === null) return cell;
  return (
    <Tooltip>
      <TooltipTrigger render={cell} />
      <TooltipContent>
        {SERIES_WORDS.pagesOfTarget(episode.pages, targetPages)}
      </TooltipContent>
    </Tooltip>
  );
}

export function LastEditedCell(props: {
  edited: EpisodeLastEdited;
  now: number;
}): ReactNode {
  const { edited, now } = props;
  let text: string = SERIES_WORDS.blank;
  if (edited !== null) {
    text =
      "changedSinceOpened" in edited
        ? SERIES_WORDS.changedSinceOpened
        : LIBRARY_WORDS.edited(edited.byName, formatWhen(edited.at, now));
  }
  return (
    <span
      title={text}
      className={cn(
        COL_EDITED,
        "items-center text-meta text-fg-muted tabular-nums",
      )}
    >
      <span className="truncate">{text}</span>
    </span>
  );
}
