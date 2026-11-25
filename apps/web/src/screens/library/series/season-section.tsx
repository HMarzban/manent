// One season of a series: its heading with Board, New episode and New season, and either its episode table or its empty state.
import type { EpisodeEntry, SeasonEntry } from "@manent/crdt";
import { Button, SERIES_WORDS, VirtualRows, cn } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { RowPlace } from "../../../services/ports.ts";
import { DOCUMENT_ROW_LINES } from "../document-row-lines.ts";
import {
  COL_DUE,
  COL_EDITED,
  COL_EP,
  COL_PAGES,
  COL_PLACE,
  COL_STAGE,
  COL_TITLE,
  COL_WRITER,
  SERIES_PLACE_COLUMN,
} from "./episode-cells.tsx";
import { EpisodeRow } from "./episode-row.tsx";
import type { EpisodeLastEdited, SeriesPerson } from "./series-facts.ts";

const VIRTUAL_LIMIT = 100;

export function seasonHeadingText(
  projectTitle: string,
  season: SeasonEntry,
): string {
  return season.title === null || season.title.trim() === ""
    ? SERIES_WORDS.seasonHeading(projectTitle, season.number)
    : `${projectTitle} · ${season.title}`;
}

export function SeasonSection(props: {
  projectId: string;
  projectTitle: string;
  season: SeasonEntry;
  episodes: readonly EpisodeEntry[];
  targetPages: number | null;
  canEdit: boolean;
  creating: boolean;
  people: readonly SeriesPerson[];
  lastEditedByDoc: ReadonlyMap<string, EpisodeLastEdited>;
  placeByDoc: ReadonlyMap<string, RowPlace>;
  shell: "web" | "desktop";
  now: number;
  open(docId: string): void;
  onSaveEpisode(next: EpisodeEntry, renamedTitle?: string | null): void;
  onNewEpisode(season: SeasonEntry): void;
  onNewSeason(): void;
}): ReactNode {
  const {
    projectId,
    projectTitle,
    season,
    episodes,
    targetPages,
    canEdit,
    creating,
    people,
    lastEditedByDoc,
    placeByDoc,
    shell,
    now,
    open,
    onSaveEpisode,
    onNewEpisode,
    onNewSeason,
  } = props;
  const navigate = useNavigate();
  const heading = seasonHeadingText(projectTitle, season);
  const renderRow = (index: number): ReactNode => {
    const episode = episodes[index];
    if (episode === undefined) return null;
    const targetDocId = episode.docIds.script ?? episode.docIds.outline;
    return (
      <EpisodeRow
        episode={episode}
        targetPages={targetPages}
        canEdit={canEdit}
        people={people}
        lastEdited={
          targetDocId === null
            ? null
            : (lastEditedByDoc.get(targetDocId) ?? null)
        }
        place={targetDocId === null ? undefined : placeByDoc.get(targetDocId)}
        shell={shell}
        now={now}
        open={open}
        onSave={onSaveEpisode}
      />
    );
  };
  return (
    <section aria-label={heading} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-title">{heading}</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void navigate({
              href: `/p/${projectId}/board?season=${encodeURIComponent(season.id)}`,
            })
          }
        >
          {SERIES_WORDS.stages.board}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!canEdit || creating}
          onClick={() => onNewEpisode(season)}
        >
          <PlusIcon aria-hidden="true" data-icon="inline-start" />
          {SERIES_WORDS.newEpisode}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!canEdit || creating}
          onClick={onNewSeason}
        >
          <PlusIcon aria-hidden="true" data-icon="inline-start" />
          {SERIES_WORDS.newSeason}
        </Button>
      </div>
      {episodes.length === 0 ? (
        <div className="flex flex-col items-start gap-2 py-3">
          <p className="text-ui text-fg-muted">{SERIES_WORDS.empty}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={!canEdit || creating}
            onClick={() => onNewEpisode(season)}
          >
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            {SERIES_WORDS.newEpisode}
          </Button>
        </div>
      ) : (
        <div
          data-tour="episode_table"
          className={cn("mn-table flex flex-col", SERIES_PLACE_COLUMN)}
        >
          <div className="mn-table-head flex shrink-0 items-center gap-2 px-3">
            <span className={COL_EP}>{SERIES_WORDS.columns.ep}</span>
            <span className={COL_TITLE}>{SERIES_WORDS.columns.title}</span>
            <span className={COL_WRITER}>{SERIES_WORDS.columns.writer}</span>
            <span className={COL_STAGE}>{SERIES_WORDS.columns.stage}</span>
            <span className={COL_DUE}>{SERIES_WORDS.columns.due}</span>
            <span className={COL_PAGES}>{SERIES_WORDS.columns.pages}</span>
            <span className={COL_EDITED}>
              {SERIES_WORDS.columns.lastEdited}
            </span>
            <span aria-hidden="true" className={COL_PLACE} />
          </div>
          <div
            className={episodes.length > VIRTUAL_LIMIT ? "h-96" : "shrink-0"}
          >
            <VirtualRows
              count={episodes.length}
              rowHeight={DOCUMENT_ROW_LINES.length > 0 ? "two" : "one"}
              label={heading}
              renderRow={renderRow}
            />
          </div>
        </div>
      )}
    </section>
  );
}
