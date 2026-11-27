// Corner cell and read-only / empty-episode Board matrix renderer sharing identical grid geometry with SortableLists.
import type { EpisodeEntry } from "@manent/crdt";
import {
  BOARD_WORDS,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@manent/ui";
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { Fragment } from "react";
import type { ReactNode } from "react";
import { cardsInCell, cellKey } from "../../board/model.ts";
import type {
  BoardCard,
  BoardStoryline,
  StorylineTone,
} from "../../board/model.ts";

export function BoardCornerCell(props: {
  readonly storylineCount: number;
  readonly allCollapsed: boolean;
  onToggleCollapseAll(): void;
}): ReactNode {
  const { storylineCount, allCollapsed, onToggleCollapseAll } = props;
  return (
    <div
      style={{ gridColumn: 1, gridRow: 1 }}
      className="mn-board-corner flex min-h-row items-center justify-between gap-1 px-2.5 py-2"
    >
      <span className="mn-group-label p-0!">
        {BOARD_WORDS.storylinesHeading}
      </span>
      {storylineCount > 1 ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={
                  allCollapsed ? BOARD_WORDS.expandAll : BOARD_WORDS.collapseAll
                }
                onClick={onToggleCollapseAll}
                className="text-fg-muted hover:text-fg"
              />
            }
          >
            {allCollapsed ? (
              <ChevronsUpDownIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <ChevronsDownUpIcon aria-hidden="true" className="size-3.5" />
            )}
          </TooltipTrigger>
          <TooltipContent>
            {allCollapsed ? BOARD_WORDS.expandAll : BOARD_WORDS.collapseAll}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

export function BoardStaticMatrix(props: {
  readonly columns: string;
  readonly headerCells: ReactNode;
  readonly storylines: readonly BoardStoryline[];
  readonly episodes: readonly EpisodeEntry[];
  readonly cards: readonly BoardCard[];
  readonly laneByStoryline: ReadonlyMap<string, StorylineTone>;
  readonly collapsedStorylineIds: ReadonlySet<string>;
  readonly hoveredStorylineId: string | null;
  readonly focusedEpisodeId: string | null;
  readonly listClassName: string;
  readonly addStorylineRow: ReactNode;
  onHoverStoryline(id: string | null): void;
  renderStorylineBefore(rowIndex: number): ReactNode;
  renderCard(cardId: string): ReactNode;
  renderFooterFor(
    storyline: BoardStoryline,
    episode: EpisodeEntry,
    count: number,
  ): ReactNode;
}): ReactNode {
  const {
    columns,
    headerCells,
    storylines,
    episodes,
    cards,
    laneByStoryline,
    collapsedStorylineIds,
    hoveredStorylineId,
    focusedEpisodeId,
    listClassName,
    addStorylineRow,
    onHoverStoryline,
    renderStorylineBefore,
    renderCard,
    renderFooterFor,
  } = props;
  return (
    <div
      data-ring="inset"
      style={{ gridTemplateColumns: columns }}
      className="mn-board-grid"
    >
      {headerCells}
      {storylines.map((storyline, rowIndex) => {
        const collapsed = collapsedStorylineIds.has(storyline.id);
        const lane = laneByStoryline.get(storyline.id) ?? 1;
        return (
          <Fragment key={storyline.id}>
            {renderStorylineBefore(rowIndex)}
            {episodes.map((episode, colIndex) => {
              const cellCards = cardsInCell(cards, storyline.id, episode.id);
              const id = cellKey(storyline.id, episode.id);
              return (
                <div
                  key={id}
                  data-board-cell={id}
                  data-lane={lane}
                  data-empty={cellCards.length === 0 ? "true" : "false"}
                  data-collapsed={collapsed ? "true" : undefined}
                  data-lane-hover={
                    hoveredStorylineId === storyline.id ? "true" : undefined
                  }
                  data-focused-ep={
                    focusedEpisodeId === episode.id ? "true" : undefined
                  }
                  style={{ gridColumn: colIndex + 2, gridRow: rowIndex + 2 }}
                  onPointerEnter={() => onHoverStoryline(storyline.id)}
                  onPointerLeave={() => onHoverStoryline(null)}
                  className="mn-board-cell"
                >
                  {!collapsed ? (
                    <div
                      role="list"
                      aria-label={BOARD_WORDS.cellLabel(
                        storyline.title,
                        episode.number,
                      )}
                      className={listClassName}
                    >
                      {cellCards.map((card) => (
                        <div key={card.id} role="listitem">
                          {renderCard(card.id)}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {renderFooterFor(storyline, episode, cellCards.length)}
                </div>
              );
            })}
          </Fragment>
        );
      })}
      {addStorylineRow}
    </div>
  );
}
