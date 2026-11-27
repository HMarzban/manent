// Season header row and summary strip: collapse chevron, inline season rename, Board / New episode actions and summary counts.
import type { SeasonEntry } from "@manent/crdt";
import { Button, Input, SERIES_WORDS, cn } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  Columns3Icon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { SeasonStats } from "./series-facts.ts";

export interface SeasonHeaderBarProps {
  readonly projectId: string;
  readonly season: SeasonEntry;
  readonly heading: string;
  readonly episodeCount: number;
  readonly targetPages: number | null;
  readonly stats: SeasonStats;
  readonly collapsible: boolean;
  readonly collapsed: boolean;
  readonly hideNewSeasonButton: boolean;
  readonly canEdit: boolean;
  readonly creating: boolean;
  onToggleCollapse(): void;
  onRenameSeason?(season: SeasonEntry, title: string | null): void;
  onNewEpisode(season: SeasonEntry): void;
  onNewSeason?(): void;
}

export function SeasonHeaderBar(props: SeasonHeaderBarProps): ReactNode {
  const {
    projectId,
    season,
    heading,
    episodeCount,
    targetPages,
    stats,
    collapsible,
    collapsed,
    hideNewSeasonButton,
    canEdit,
    creating,
    onToggleCollapse,
    onRenameSeason,
    onNewEpisode,
    onNewSeason,
  } = props;
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const commitRename = (): void => {
    setRenaming(false);
    if (onRenameSeason === undefined) return;
    const trimmed = titleDraft.trim();
    const next = trimmed === "" ? null : trimmed;
    if (next !== season.title) onRenameSeason(season, next);
  };

  const onRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") commitRename();
    if (event.key === "Escape") setRenaming(false);
  };

  const summaryParts =
    episodeCount > 0
      ? [
          SERIES_WORDS.episodeCount(stats.total),
          stats.locked > 0 ? SERIES_WORDS.lockedCount(stats.locked) : null,
          stats.openNotes > 0
            ? SERIES_WORDS.openNotesCount(stats.openNotes)
            : null,
          targetPages !== null
            ? SERIES_WORDS.targetPagesLabel(targetPages)
            : null,
          stats.boardCards > 0
            ? SERIES_WORDS.boardCardsCount(stats.boardCards)
            : null,
        ].filter((part): part is string => part !== null)
      : [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-44 basis-full items-center gap-1.5 @md:basis-auto @md:flex-1">
          {collapsible ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-expanded={!collapsed}
              aria-label={
                collapsed
                  ? SERIES_WORDS.expandSeason(heading)
                  : SERIES_WORDS.collapseSeason(heading)
              }
              onClick={onToggleCollapse}
              className="shrink-0 text-fg-muted hover:text-fg"
            >
              <ChevronRightIcon
                aria-hidden="true"
                className={cn(
                  "mn-tree-chevron size-3.5",
                  !collapsed ? "rotate-90" : undefined,
                )}
              />
            </Button>
          ) : null}
          {renaming && canEdit && onRenameSeason !== undefined ? (
            <Input
              autoFocus
              aria-label={SERIES_WORDS.renameSeason}
              placeholder={SERIES_WORDS.seasonTitlePlaceholder}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={onRenameKeyDown}
              className="h-control-sm max-w-64 text-title"
            />
          ) : (
            <h2
              onDoubleClick={
                canEdit && onRenameSeason !== undefined
                  ? () => {
                      setTitleDraft(season.title ?? "");
                      setRenaming(true);
                    }
                  : undefined
              }
              className="min-w-0 basis-full truncate text-title @md:basis-auto"
            >
              {heading}
            </h2>
          )}
          {canEdit && onRenameSeason !== undefined && !renaming ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={SERIES_WORDS.renameSeason}
              title={SERIES_WORDS.renameSeason}
              onClick={() => {
                setTitleDraft(season.title ?? "");
                setRenaming(true);
              }}
              className="shrink-0 text-fg-muted hover:text-fg"
            >
              <PencilIcon aria-hidden="true" className="size-3.5" />
            </Button>
          ) : null}
          {collapsed && episodeCount === 0 ? (
            <span className="mn-tag shrink-0">
              {SERIES_WORDS.emptySeasonTag}
            </span>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void navigate({
              href: `/p/${projectId}/board?season=${encodeURIComponent(season.id)}`,
            })
          }
          className="cursor-pointer gap-1.5"
        >
          <Columns3Icon aria-hidden="true" className="size-icon shrink-0" />
          <span>{SERIES_WORDS.stages.board}</span>
        </Button>
        {episodeCount > 0 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={!canEdit || creating}
            onClick={() => onNewEpisode(season)}
            className="cursor-pointer"
          >
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            {SERIES_WORDS.newEpisode}
          </Button>
        ) : null}
        {!hideNewSeasonButton && onNewSeason !== undefined ? (
          <Button
            variant="outline"
            size="sm"
            disabled={!canEdit || creating}
            onClick={onNewSeason}
            className="cursor-pointer"
          >
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            {SERIES_WORDS.newSeason}
          </Button>
        ) : null}
      </div>

      {summaryParts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-fg-muted tabular-nums">
          {summaryParts.map((part, index) => (
            <span
              key={part}
              className={
                part === SERIES_WORDS.openNotesCount(stats.openNotes) &&
                stats.openNotes > 0
                  ? "text-attention"
                  : undefined
              }
            >
              {index > 0 ? "· " : ""}
              {part}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}
