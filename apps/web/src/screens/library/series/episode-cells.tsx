// Column widths and read-only episode cells: Stage (with revision chip when matching), Pages (with ▲N over target) and Last edited.
import type { EpisodeEntry } from "@manent/crdt";
import { COLOUR_NAMES, REVISION_COLOURS } from "@manent/revisions";
import type { RevisionColour } from "@manent/revisions";
import {
  LIBRARY_WORDS,
  SERIES_WORDS,
  cn,
  formatCount,
  formatWhen,
} from "@manent/ui";
import type { ReactNode } from "react";
import type { EpisodeLastEdited } from "./series-facts.ts";

export const COL_EP = "w-11 shrink-0 tabular-nums";
export const COL_TITLE = "min-w-0 flex-1";
export const COL_WRITER = "hidden w-24 shrink-0 @2xl:flex";
export const COL_STAGE = "hidden w-28 shrink-0 @xl:flex";
export const COL_DUE = "hidden w-16 shrink-0 tabular-nums @2xl:flex";
export const COL_PAGES = "hidden w-16 shrink-0 mn-num @lg:flex";
export const COL_EDITED = "hidden w-40 shrink-0 @2xl:flex";
export const COL_PLACE = "w-28 shrink-0";
export const SERIES_PLACE_COLUMN =
  "[&_.mn-row>span:last-child]:w-28 [&_.mn-row>span:last-child]:shrink-0";

function revisionColourFor(stage: string): RevisionColour | null {
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

export function StageCell(props: { episode: EpisodeEntry }): ReactNode {
  const { episode } = props;
  const { stage, openCount, docIds } = episode;
  const fallbackStage =
    docIds.script === null && docIds.outline !== null
      ? SERIES_WORDS.stages.outline
      : null;
  const baseStage = stage ?? fallbackStage;
  const revColour = baseStage === null ? null : revisionColourFor(baseStage);
  let text: string = SERIES_WORDS.blank;
  if (openCount !== null && openCount.open > 0) {
    text = SERIES_WORDS.draftOpen(baseStage ?? openCount.round, openCount.open);
  } else if (baseStage !== null) {
    text = baseStage;
  }
  return (
    <span
      className={cn(
        COL_STAGE,
        "items-center gap-1.5 truncate text-meta text-fg-muted",
      )}
    >
      {revColour === null ? null : (
        <span data-rev={revColour} aria-hidden="true" className="mn-rev-chip" />
      )}
      <span className="truncate">{text}</span>
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
  return (
    <span className={cn(COL_PAGES, "items-center gap-1 text-meta text-fg")}>
      <span>{formatCount(episode.pages)}</span>
      {over > 0 ? (
        <span className="text-attention">
          {SERIES_WORDS.changedCount(over)}
        </span>
      ) : null}
    </span>
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
    <span className={cn(COL_EDITED, "truncate text-meta text-fg-muted")}>
      {text}
    </span>
  );
}
