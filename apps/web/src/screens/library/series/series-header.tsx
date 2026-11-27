// Series project masthead above multi-season sections: season quick-jump pills, single New season button and Project settings link.
import type { SeasonEntry } from "@manent/crdt";
import { Button, SERIES_WORDS } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon, SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";
import { seasonHeadingText } from "./season-section.tsx";

export interface SeriesHeaderProps {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly seasons: readonly SeasonEntry[];
  readonly episodeCountBySeason: ReadonlyMap<string, number>;
  readonly canEdit: boolean;
  readonly creating: boolean;
  onNewSeason(): void;
  onJumpSeason(seasonId: string): void;
}

export function SeriesHeader(props: SeriesHeaderProps): ReactNode {
  const {
    projectId,
    projectTitle,
    seasons,
    episodeCountBySeason,
    canEdit,
    creating,
    onNewSeason,
    onJumpSeason,
  } = props;
  const navigate = useNavigate();

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="truncate text-title font-semibold text-fg">
          {projectTitle}
        </span>
        {seasons.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1">
            {seasons.map((season) => {
              const count = episodeCountBySeason.get(season.id) ?? 0;
              const heading = seasonHeadingText(projectTitle, season);
              return (
                <button
                  key={season.id}
                  type="button"
                  aria-label={SERIES_WORDS.jumpToSeason(heading)}
                  title={heading}
                  onClick={() => onJumpSeason(season.id)}
                  className={
                    count > 0
                      ? "inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-control border border-line bg-raised px-2 text-micro font-semibold text-fg tabular-nums transition-colors duration-(--dur-fast) hover:bg-subtle"
                      : "inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-control border border-transparent px-2 text-micro text-fg-muted tabular-nums transition-colors duration-(--dur-fast) hover:bg-subtle hover:text-fg"
                  }
                >
                  <span>{SERIES_WORDS.seasonShort(season.number)}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            void navigate({
              href: `/p/${projectId}/settings?from=%2F`,
            })
          }
          className="cursor-pointer gap-1.5 text-fg-muted hover:text-fg"
        >
          <SettingsIcon aria-hidden="true" className="size-icon shrink-0" />
          <span>{SERIES_WORDS.projectSettings}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canEdit || creating}
          onClick={onNewSeason}
          className="cursor-pointer"
        >
          <PlusIcon aria-hidden="true" data-icon="inline-start" />
          {SERIES_WORDS.newSeason}
        </Button>
      </div>
    </div>
  );
}
