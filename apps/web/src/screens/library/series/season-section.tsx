// One season of a series: collapsible heading, summary strip, filter bar and episode table.
import type { EpisodeEntry, SeasonEntry } from "@manent/crdt";
import { Button, SERIES_WORDS, VirtualRows } from "@manent/ui";
import { FilmIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../../../empty-hero-card.tsx";
import type { RowPlace } from "../../../services/ports.ts";
import { fullNameOf } from "../../../services/sync/index-entries.ts";
import {
  COL_DUE,
  COL_EDITED,
  COL_EP,
  COL_PAGES,
  COL_PLACE,
  COL_STAGE,
  COL_TITLE,
  COL_WRITER,
  resolvedEpisodeStage,
} from "./episode-cells.tsx";
import { EpisodeRow } from "./episode-row.tsx";
import { SeasonHeaderBar } from "./season-header.tsx";
import { SeasonToolbar } from "./season-toolbar.tsx";
import { computeSeasonStats, episodeNeedsAttention } from "./series-facts.ts";
import type { EpisodeLastEdited, SeriesPerson } from "./series-facts.ts";

const VIRTUAL_LIMIT = 100;
const FILTER_BAR_MIN_EPISODES = 6;

export function seasonHeadingText(
  projectTitle: string,
  season: SeasonEntry,
): string {
  return season.title === null || season.title.trim() === ""
    ? SERIES_WORDS.seasonHeading(projectTitle, season.number)
    : `${projectTitle} · ${season.title}`;
}

export function SeasonSection(props: {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly season: SeasonEntry;
  readonly episodes: readonly EpisodeEntry[];
  readonly targetPages: number | null;
  readonly ladder?: readonly string[];
  readonly boardCardCount?: number;
  readonly collapsible?: boolean;
  readonly defaultCollapsed?: boolean;
  readonly hideNewSeasonButton?: boolean;
  readonly canEdit: boolean;
  readonly creating: boolean;
  readonly people: readonly SeriesPerson[];
  readonly lastEditedByDoc: ReadonlyMap<string, EpisodeLastEdited>;
  readonly placeByDoc: ReadonlyMap<string, RowPlace>;
  readonly shell: "web" | "desktop";
  readonly now: number;
  open(docId: string): void;
  onSaveEpisode(next: EpisodeEntry, renamedTitle?: string | null): void;
  onRenameSeason?(season: SeasonEntry, title: string | null): void;
  onNewEpisode(season: SeasonEntry): void;
  onNewSeason?(): void;
}): ReactNode {
  const {
    projectId,
    projectTitle,
    season,
    episodes,
    targetPages,
    ladder = [],
    boardCardCount = 0,
    collapsible = false,
    defaultCollapsed = false,
    hideNewSeasonButton = false,
    canEdit,
    creating,
    people,
    lastEditedByDoc,
    placeByDoc,
    shell,
    now,
    open,
    onSaveEpisode,
    onRenameSeason,
    onNewEpisode,
    onNewSeason,
  } = props;
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [query, setQuery] = useState("");
  const [selectedWriterId, setSelectedWriterId] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [attentionOnly, setAttentionOnly] = useState(false);

  const heading = seasonHeadingText(projectTitle, season);
  const stats = useMemo(
    () => computeSeasonStats(episodes, targetPages, boardCardCount, now),
    [episodes, targetPages, boardCardCount, now],
  );

  const filterWriters = useMemo(() => {
    const ids = new Set<string>();
    for (const ep of episodes) {
      if (ep.writerUserId !== null) ids.add(ep.writerUserId);
    }
    return [...ids].map((userId) => ({
      userId,
      name: people.find((p) => p.userId === userId)?.name ?? fullNameOf(userId),
    }));
  }, [episodes, people]);

  const filterStages = useMemo(() => {
    const stages = new Set<string>();
    for (const ep of episodes) {
      const stage = resolvedEpisodeStage(ep);
      if (stage !== null) stages.add(stage);
    }
    return [...stages];
  }, [episodes]);

  const attentionCount = useMemo(
    () =>
      episodes.filter((ep) => episodeNeedsAttention(ep, targetPages, now))
        .length,
    [episodes, targetPages, now],
  );

  const hasActiveFilter =
    query.trim() !== "" ||
    selectedWriterId !== null ||
    selectedStage !== null ||
    attentionOnly;

  const visibleEpisodes = useMemo(() => {
    if (!hasActiveFilter) return episodes;
    const needle = query.trim().toLowerCase();
    return episodes.filter((ep) => {
      if (selectedWriterId !== null && ep.writerUserId !== selectedWriterId)
        return false;
      if (selectedStage !== null && resolvedEpisodeStage(ep) !== selectedStage)
        return false;
      if (attentionOnly && !episodeNeedsAttention(ep, targetPages, now))
        return false;
      if (needle === "") return true;
      const title = (ep.title ?? SERIES_WORDS.untitledEpisode).toLowerCase();
      return title.includes(needle) || String(ep.number).includes(needle);
    });
  }, [
    episodes,
    hasActiveFilter,
    query,
    selectedWriterId,
    selectedStage,
    attentionOnly,
    targetPages,
    now,
  ]);

  const clearFilters = (): void => {
    setQuery("");
    setSelectedWriterId(null);
    setSelectedStage(null);
    setAttentionOnly(false);
  };

  const renderRow = (index: number): ReactNode => {
    const episode = visibleEpisodes[index];
    if (episode === undefined) return null;
    const targetDocId = episode.docIds.script ?? episode.docIds.outline;
    return (
      <EpisodeRow
        projectId={projectId}
        episode={episode}
        targetPages={targetPages}
        ladder={ladder}
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
    <section
      id={`season-${season.id}`}
      aria-label={heading}
      className="flex flex-col gap-2"
    >
      <SeasonHeaderBar
        projectId={projectId}
        season={season}
        heading={heading}
        episodeCount={episodes.length}
        targetPages={targetPages}
        stats={stats}
        collapsible={collapsible}
        collapsed={collapsed}
        hideNewSeasonButton={hideNewSeasonButton}
        canEdit={canEdit}
        creating={creating}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onRenameSeason={onRenameSeason}
        onNewEpisode={onNewEpisode}
        onNewSeason={onNewSeason}
      />

      {collapsed ? null : episodes.length === 0 ? (
        <EmptyHeroCard
          compact
          icon={<FilmIcon aria-hidden="true" className="size-5" />}
          title={SERIES_WORDS.empty}
          actions={
            <Button
              variant="outline"
              size="sm"
              disabled={!canEdit || creating}
              onClick={() => onNewEpisode(season)}
            >
              <PlusIcon aria-hidden="true" data-icon="inline-start" />
              {SERIES_WORDS.newEpisode}
            </Button>
          }
        />
      ) : (
        <>
          {episodes.length >= FILTER_BAR_MIN_EPISODES || hasActiveFilter ? (
            <SeasonToolbar
              query={query}
              writers={filterWriters}
              selectedWriterId={selectedWriterId}
              stages={filterStages}
              selectedStage={selectedStage}
              attentionOnly={attentionOnly}
              attentionCount={attentionCount}
              shownCount={visibleEpisodes.length}
              totalCount={episodes.length}
              hasActiveFilter={hasActiveFilter}
              onQueryChange={setQuery}
              onSelectWriter={setSelectedWriterId}
              onSelectStage={setSelectedStage}
              onToggleAttention={() => setAttentionOnly((v) => !v)}
              onClearFilters={clearFilters}
            />
          ) : null}

          {visibleEpisodes.length === 0 ? (
            <EmptyHeroCard
              compact
              icon={<SearchIcon aria-hidden="true" className="size-5" />}
              description={SERIES_WORDS.noFilterMatches}
              actions={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  {SERIES_WORDS.clearFilters}
                </Button>
              }
            />
          ) : (
            <div data-tour="episode_table" className="mn-table flex flex-col">
              <div className="mn-table-head flex shrink-0 items-center gap-2 px-3">
                <span className={COL_EP}>{SERIES_WORDS.columns.ep}</span>
                <span className={COL_TITLE}>{SERIES_WORDS.columns.title}</span>
                <span className={COL_WRITER}>
                  {SERIES_WORDS.columns.writer}
                </span>
                <span className={COL_STAGE}>{SERIES_WORDS.columns.stage}</span>
                <span className={COL_DUE}>{SERIES_WORDS.columns.due}</span>
                <span className={COL_PAGES}>{SERIES_WORDS.columns.pages}</span>
                <span className={COL_EDITED}>
                  {SERIES_WORDS.columns.lastEdited}
                </span>
                <span aria-hidden="true" className="w-6 shrink-0" />
                <span aria-hidden="true" className={COL_PLACE} />
              </div>
              <div
                className={
                  visibleEpisodes.length > VIRTUAL_LIMIT ? "h-96" : "shrink-0"
                }
              >
                <VirtualRows
                  count={visibleEpisodes.length}
                  rowHeight="two"
                  label={heading}
                  renderRow={renderRow}
                />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
