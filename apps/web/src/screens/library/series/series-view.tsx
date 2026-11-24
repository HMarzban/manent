// The Library's view of a series: its seasons and episode tables, with New episode, New season and Board links.
import { writeEpisode } from "@manent/crdt";
import type { EpisodeEntry, SeasonEntry } from "@manent/crdt";
import { Button, SERIES_WORDS } from "@manent/ui";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  createSeriesEpisode,
  createSeriesSeason,
} from "../../../series/create-episode.ts";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import type { ProjectViewProps } from "../project-views.ts";
import { SeasonSection } from "./season-section.tsx";
import { useSeriesData } from "./use-series-data.ts";

export function SeriesView(props: ProjectViewProps): ReactNode {
  const { project, shell, now, open } = props;
  const services = useServices();
  const { language, online, randomId, schedule } = useEnvironment();
  const data = useSeriesData(project.projectId, project.firstDocId);
  const [creating, setCreating] = useState(false);

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

  if (data.seasons.length === 0) {
    return (
      <section aria-label={project.title} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-title">
            {project.title}
          </h2>
          <Button
            variant="outline"
            size="sm"
            disabled={!data.canEdit || creating}
            onClick={onNewSeason}
          >
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            {SERIES_WORDS.newSeason}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {data.seasons.map((season) => (
        <SeasonSection
          key={season.id}
          projectId={project.projectId}
          projectTitle={project.title}
          season={season}
          episodes={data.episodes.filter((ep) => ep.seasonId === season.id)}
          targetPages={data.targetPages}
          canEdit={data.canEdit}
          creating={creating}
          people={data.people}
          lastEditedByDoc={data.lastEditedByDoc}
          placeByDoc={data.placeByDoc}
          shell={shell}
          now={now}
          open={open}
          onSaveEpisode={onSaveEpisode}
          onNewEpisode={onNewEpisode}
          onNewSeason={onNewSeason}
        />
      ))}
    </div>
  );
}
