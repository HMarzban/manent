// The Library's view of a series: cohesive SeriesHeader, collapsible seasons with summary strips and Board/episode links.
import { writeEpisode, writeSeason } from "@manent/crdt";
import type { EpisodeEntry, SeasonEntry } from "@manent/crdt";
import { Button, SERIES_WORDS, Skeleton } from "@manent/ui";
import { FilmIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../../../empty-hero-card.tsx";
import {
  createSeriesEpisode,
  createSeriesSeason,
} from "../../../series/create-episode.ts";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import type { ProjectViewProps } from "../project-views.ts";
import { SeasonSection } from "./season-section.tsx";
import { SeriesHeader } from "./series-header.tsx";
import { useSeriesData } from "./use-series-data.ts";

export function SeriesView(props: ProjectViewProps): ReactNode {
  const { project, shell, now, open } = props;
  const services = useServices();
  const { language, online, randomId, schedule } = useEnvironment();
  const data = useSeriesData(project.projectId, project.firstDocId);
  const [creating, setCreating] = useState(false);
  const [indexOpened, setIndexOpened] = useState(false);

  useEffect(() => {
    let shown = true;
    setIndexOpened(false);
    void data.index.handle().then(
      () => {
        if (shown) setIndexOpened(true);
      },
      () => {
        if (shown) setIndexOpened(true);
      },
    );
    return () => {
      shown = false;
    };
  }, [data.index]);

  const onSaveEpisode = (
    next: EpisodeEntry,
    renamedTitle?: string | null,
  ): void => {
    void data.index.handle().then((handle) => {
      writeEpisode(handle.doc(), next);
      if (renamedTitle !== undefined && next.docIds.script !== null) {
        const docTitle =
          renamedTitle === null
            ? `${next.number} ${SERIES_WORDS.untitledEpisode}`
            : `${next.number} ${renamedTitle}`;
        services.library.renameDocument(next.docIds.script, docTitle);
      }
    });
  };

  const onRenameSeason = (season: SeasonEntry, title: string | null): void => {
    void data.index.handle().then((handle) => {
      writeSeason(handle.doc(), { ...season, title });
    });
  };

  const onNewEpisode = (season: SeasonEntry): void => {
    if (data.workspaceId === null || creating) return;
    setCreating(true);
    void createSeriesEpisode({
      services,
      index: data.index,
      workspaceId: data.workspaceId,
      projectId: project.projectId,
      season,
      episodes: data.episodes,
      language,
      online,
      randomId,
      schedule,
    })
      .then((docId) => open(docId))
      .finally(() => setCreating(false));
  };

  const onNewSeason = (): void => {
    if (creating) return;
    setCreating(true);
    void createSeriesSeason({
      index: data.index,
      seasons: data.seasons,
      randomId,
    }).finally(() => setCreating(false));
  };

  const episodeCountBySeason = useMemo(() => {
    const map = new Map<string, number>();
    for (const ep of data.episodes) {
      map.set(ep.seasonId, (map.get(ep.seasonId) ?? 0) + 1);
    }
    return map;
  }, [data.episodes]);

  if (!indexOpened && data.seasons.length === 0) {
    return (
      <section
        aria-label={project.title}
        aria-busy="true"
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-title">
            {project.title}
          </h2>
          <Skeleton aria-hidden="true" className="h-control-sm w-24 shrink-0" />
        </div>
        <div aria-hidden="true" className="mn-table flex flex-col">
          <div className="mn-table-head flex shrink-0 items-center gap-2 px-3">
            <Skeleton className="h-3 w-8 shrink-0" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="ms-auto hidden h-3 w-20 @xl:block" />
            <Skeleton className="h-3 w-16 shrink-0" />
          </div>
          {["w-44", "w-52", "w-36"].map((width, index) => (
            <div
              key={index}
              className="flex min-h-row items-center gap-2 border-t border-line px-3 first:border-t-0"
            >
              <Skeleton className="h-3.5 w-8 shrink-0" />
              <Skeleton className={`h-3.5 max-w-full ${width}`} />
              <Skeleton className="ms-auto hidden h-3.5 w-20 @xl:block" />
              <Skeleton className="h-3.5 w-16 shrink-0" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (data.seasons.length === 0) {
    return (
      <section aria-label={project.title} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-title">
            {project.title}
          </h2>
        </div>
        <div className="flex justify-center py-4">
          <EmptyHeroCard
            icon={<FilmIcon aria-hidden="true" className="size-5" />}
            title={SERIES_WORDS.empty}
            actions={
              <Button
                variant="outline"
                size="sm"
                disabled={!data.canEdit || creating}
                onClick={onNewSeason}
              >
                <PlusIcon aria-hidden="true" data-icon="inline-start" />
                {SERIES_WORDS.newSeason}
              </Button>
            }
          />
        </div>
      </section>
    );
  }

  const multiSeason = data.seasons.length > 1;
  const lastSeasonId = data.seasons[data.seasons.length - 1]?.id ?? null;

  return (
    <div className="flex flex-col gap-5">
      <SeriesHeader
        projectId={project.projectId}
        projectTitle={project.title}
        seasons={data.seasons}
        episodeCountBySeason={episodeCountBySeason}
        canEdit={data.canEdit}
        creating={creating}
        onNewSeason={onNewSeason}
        onJumpSeason={(seasonId) =>
          document
            .getElementById(`season-${seasonId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
      />
      {data.seasons.map((season) => {
        const seasonEpisodes = data.episodes.filter(
          (ep) => ep.seasonId === season.id,
        );
        const collapseEmptyPast =
          multiSeason &&
          seasonEpisodes.length === 0 &&
          season.id !== lastSeasonId;
        return (
          <SeasonSection
            key={season.id}
            projectId={project.projectId}
            projectTitle={project.title}
            season={season}
            episodes={seasonEpisodes}
            targetPages={data.targetPages}
            ladder={data.ladder}
            boardCardCount={data.boardCardsBySeason.get(season.id) ?? 0}
            collapsible={multiSeason}
            defaultCollapsed={collapseEmptyPast}
            hideNewSeasonButton={true}
            canEdit={data.canEdit}
            creating={creating}
            people={data.people}
            lastEditedByDoc={data.lastEditedByDoc}
            placeByDoc={data.placeByDoc}
            shell={shell}
            now={now}
            open={open}
            onSaveEpisode={onSaveEpisode}
            onRenameSeason={onRenameSeason}
            onNewEpisode={onNewEpisode}
            onNewSeason={onNewSeason}
          />
        );
      })}
    </div>
  );
}
