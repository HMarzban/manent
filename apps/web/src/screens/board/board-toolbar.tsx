// Compact Board filter, episode quick-jump, and density toolbar mounted above the Board stage.
import type { EpisodeEntry } from "@manent/crdt";
import {
  BOARD_WORDS,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  SERIES_WORDS,
  Segmented,
  formatCount,
} from "@manent/ui";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlagIcon,
  LayersIcon,
  Rows3Icon,
  Rows4Icon,
  SearchIcon,
  StretchHorizontalIcon,
  Unlink2Icon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { BoardStoryline, StorylineTone } from "../../board/model.ts";
import type { BoardDensity } from "./board-view.ts";

const INLINE_EPISODE_JUMP_LIMIT = 8;

export interface BoardToolbarProps {
  readonly query: string;
  readonly storylines: readonly BoardStoryline[];
  readonly laneByStoryline: ReadonlyMap<string, StorylineTone>;
  readonly cardCountByStoryline: ReadonlyMap<string, number>;
  readonly selectedStorylineIds: ReadonlySet<string>;
  readonly unlinkedOnly: boolean;
  readonly unlinkedCount: number;
  readonly flaggedOnly?: boolean;
  readonly flaggedCount?: number;
  readonly episodes: readonly EpisodeEntry[];
  readonly visibleEpisodeIds: ReadonlySet<string>;
  readonly canScrollStart?: boolean;
  readonly canScrollEnd?: boolean;
  readonly hasHorizontalOverflow?: boolean;
  readonly density: BoardDensity;
  readonly filteredCardCount: number;
  readonly totalCardCount: number;
  readonly hasActiveFilter: boolean;
  onQueryChange(next: string): void;
  onToggleStoryline(storylineId: string): void;
  onClearStorylines(): void;
  onToggleUnlinked(): void;
  onToggleFlagged?(): void;
  onClearFilters(): void;
  onJumpEpisode(episodeId: string): void;
  onScrollEpisodes?(direction: -1 | 1): void;
  onDensityChange(density: BoardDensity): void;
}

export function BoardToolbar(props: BoardToolbarProps): ReactNode {
  const {
    query,
    storylines,
    laneByStoryline,
    cardCountByStoryline,
    selectedStorylineIds,
    unlinkedOnly,
    unlinkedCount,
    flaggedOnly = false,
    flaggedCount = 0,
    episodes,
    visibleEpisodeIds,
    canScrollStart = false,
    canScrollEnd = false,
    hasHorizontalOverflow = false,
    density,
    filteredCardCount,
    totalCardCount,
    hasActiveFilter,
  } = props;

  const selectedCount = selectedStorylineIds.size;
  const singleSelected =
    selectedCount === 1
      ? storylines.find((s) => selectedStorylineIds.has(s.id))
      : undefined;
  const storylineFilterLabel =
    selectedCount === 0
      ? BOARD_WORDS.allStorylines
      : singleSelected !== undefined
        ? singleSelected.title
        : BOARD_WORDS.storylinesSelected(selectedCount);

  return (
    <div className="@container shrink-0 border-b border-line bg-chrome print:hidden">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-1.5 text-ui">
        <div className="relative w-44 max-w-full shrink-0 @sm:w-52">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 start-2.5 size-3.5 -translate-y-1/2 text-fg-muted"
          />
          <Input
            type="search"
            data-board-search=""
            value={query}
            aria-label={BOARD_WORDS.filterLabel}
            placeholder={BOARD_WORDS.filterPlaceholder}
            onChange={(event) => props.onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query !== "") {
                event.preventDefault();
                event.stopPropagation();
                props.onQueryChange("");
              }
            }}
            className="h-control-sm ps-7 pe-7 text-ui"
          />
          {query !== "" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={BOARD_WORDS.clearFilters}
              onClick={() => props.onQueryChange("")}
              className="absolute top-1/2 end-0.5 -translate-y-1/2 text-fg-muted hover:text-fg"
            >
              <XIcon aria-hidden="true" className="size-3.5" />
            </Button>
          ) : null}
        </div>

        {storylines.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={selectedCount > 0 ? true : undefined}
                  className="max-w-44 cursor-pointer gap-1.5 text-ui"
                />
              }
            >
              {singleSelected !== undefined ? (
                <span
                  aria-hidden="true"
                  data-lane={laneByStoryline.get(singleSelected.id)}
                  className="mn-board-lane-dot"
                />
              ) : (
                <LayersIcon aria-hidden="true" className="size-icon shrink-0" />
              )}
              <span className="truncate">{storylineFilterLabel}</span>
              <ChevronDownIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-fg-muted"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {storylines.map((storyline) => {
                const count = cardCountByStoryline.get(storyline.id) ?? 0;
                return (
                  <DropdownMenuCheckboxItem
                    key={storyline.id}
                    checked={selectedStorylineIds.has(storyline.id)}
                    onCheckedChange={() =>
                      props.onToggleStoryline(storyline.id)
                    }
                  >
                    <span
                      aria-hidden="true"
                      data-lane={laneByStoryline.get(storyline.id)}
                      className="mn-board-lane-dot"
                    />
                    <span className="flex-1 truncate">{storyline.title}</span>
                    <span className="text-micro text-fg-muted tabular-nums">
                      {formatCount(count)}
                    </span>
                  </DropdownMenuCheckboxItem>
                );
              })}
              {selectedCount > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={props.onClearStorylines}>
                    <span>{BOARD_WORDS.showAllStorylines}</span>
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={unlinkedOnly}
          aria-label={BOARD_WORDS.unlinkedOnlyLabel}
          onClick={props.onToggleUnlinked}
          className="cursor-pointer gap-1.5 text-ui"
        >
          <Unlink2Icon aria-hidden="true" className="size-icon shrink-0" />
          <span>{BOARD_WORDS.unlinkedOnly}</span>
          {unlinkedCount > 0 ? (
            <span className="text-micro text-fg-muted tabular-nums">
              {formatCount(unlinkedCount)}
            </span>
          ) : null}
        </Button>

        {props.onToggleFlagged !== undefined &&
        (flaggedCount > 0 || flaggedOnly) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={flaggedOnly}
            aria-label={BOARD_WORDS.flaggedOnlyLabel}
            onClick={props.onToggleFlagged}
            className="cursor-pointer gap-1.5 text-ui"
          >
            <FlagIcon
              aria-hidden="true"
              className="size-icon shrink-0 text-attention"
            />
            <span>{BOARD_WORDS.flaggedOnly}</span>
            {flaggedCount > 0 ? (
              <span className="text-micro text-fg-muted tabular-nums">
                {formatCount(flaggedCount)}
              </span>
            ) : null}
          </Button>
        ) : null}

        {hasActiveFilter ? (
          <div className="flex items-center gap-1.5">
            <span
              aria-live="polite"
              className="text-meta text-fg-muted tabular-nums"
            >
              {BOARD_WORDS.filterCount(filteredCardCount, totalCardCount)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={props.onClearFilters}
              className="cursor-pointer text-meta text-fg-muted hover:text-fg"
            >
              {BOARD_WORDS.clearFilters}
            </Button>
          </div>
        ) : null}

        <div className="ms-auto flex flex-wrap items-center gap-2">
          {episodes.length > 1 ? (
            <div className="flex items-center gap-0.5">
              {hasHorizontalOverflow && props.onScrollEpisodes !== undefined ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!canScrollStart}
                  aria-label={BOARD_WORDS.scrollLeft}
                  title={BOARD_WORDS.scrollLeft}
                  onClick={() => props.onScrollEpisodes?.(-1)}
                  className="cursor-pointer text-fg-muted hover:text-fg disabled:cursor-default"
                >
                  <ChevronLeftIcon aria-hidden="true" className="size-4" />
                </Button>
              ) : null}

              {episodes.length <= INLINE_EPISODE_JUMP_LIMIT ? (
                <div
                  role="group"
                  aria-label={BOARD_WORDS.episodesJumpLabel}
                  className="hidden items-center gap-0.5 @4xl:flex"
                >
                  {episodes.map((ep) => {
                    const title = ep.title ?? SERIES_WORDS.untitledEpisode;
                    return (
                      <button
                        key={ep.id}
                        type="button"
                        data-in-view={
                          visibleEpisodeIds.has(ep.id) ? "true" : undefined
                        }
                        aria-label={BOARD_WORDS.jumpToEpisode(ep.number, title)}
                        title={BOARD_WORDS.jumpToEpisode(ep.number, title)}
                        onClick={() => props.onJumpEpisode(ep.id)}
                        className="mn-board-ep-jump cursor-pointer"
                      >
                        {ep.number}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="hidden cursor-pointer gap-1 text-ui text-fg-muted hover:text-fg @3xl:inline-flex"
                      />
                    }
                  >
                    <span>{BOARD_WORDS.episodesJumpLabel}</span>
                    <ChevronDownIcon aria-hidden="true" className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {episodes.map((ep) => {
                      const title = ep.title ?? SERIES_WORDS.untitledEpisode;
                      return (
                        <DropdownMenuItem
                          key={ep.id}
                          onClick={() => props.onJumpEpisode(ep.id)}
                        >
                          <span className="mn-scene-num shrink-0">
                            {ep.number}
                          </span>
                          <span className="flex-1 truncate">{title}</span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {hasHorizontalOverflow && props.onScrollEpisodes !== undefined ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!canScrollEnd}
                  aria-label={BOARD_WORDS.scrollRight}
                  title={BOARD_WORDS.scrollRight}
                  onClick={() => props.onScrollEpisodes?.(1)}
                  className="cursor-pointer text-fg-muted hover:text-fg disabled:cursor-default"
                >
                  <ChevronRightIcon aria-hidden="true" className="size-4" />
                </Button>
              ) : null}
            </div>
          ) : null}

          <Segmented
            label={BOARD_WORDS.densityLabel}
            value={density}
            options={[
              {
                value: "fit",
                label: BOARD_WORDS.densityFit,
                icon: (
                  <StretchHorizontalIcon
                    aria-hidden="true"
                    className="size-3.5"
                  />
                ),
              },
              {
                value: "comfortable",
                label: BOARD_WORDS.densityComfortable,
                icon: <Rows3Icon aria-hidden="true" className="size-3.5" />,
              },
              {
                value: "compact",
                label: BOARD_WORDS.densityCompact,
                icon: <Rows4Icon aria-hidden="true" className="size-3.5" />,
              },
            ]}
            onChange={(next) => {
              if (
                next === "comfortable" ||
                next === "compact" ||
                next === "fit"
              )
                props.onDensityChange(next);
            }}
          />
        </div>
      </div>
    </div>
  );
}
