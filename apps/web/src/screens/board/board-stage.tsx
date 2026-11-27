// Board viewport stage wrapping the print masthead, scrollable BoardGrid, and edge pan scrollers.
import type { SeasonEntry } from "@manent/crdt";
import type { ReactNode, RefObject } from "react";
import { BoardGrid } from "./board-grid.tsx";
import type { BoardGridProps } from "./board-grid.tsx";
import { BoardEdgeScrollers } from "./board-pan.tsx";
import { BoardPrintHeader } from "./board-print-header.tsx";
import type { BoardViewportState } from "./use-board-viewport.ts";

export function BoardStage(
  props: BoardGridProps & {
    readonly label: string;
    readonly projectTitle: string;
    readonly activeSeason: SeasonEntry | null;
    readonly summary: string | null;
    readonly hasActiveFilter: boolean;
    readonly scrollState: BoardViewportState;
    readonly viewportRef: RefObject<HTMLElement | null>;
    onScrollEpisodes(direction: -1 | 1): void;
  },
): ReactNode {
  const {
    label,
    projectTitle,
    activeSeason,
    summary,
    hasActiveFilter,
    scrollState,
    viewportRef,
    onScrollEpisodes,
    ...gridProps
  } = props;
  return (
    <div
      data-density={gridProps.density}
      data-scrolled-x={scrollState.scrolledX ? "true" : undefined}
      data-scrolled-y={scrollState.scrolledY ? "true" : undefined}
      data-overflow-x={scrollState.hasHorizontalOverflow ? "true" : undefined}
      data-overflow-end={scrollState.overflowEnd ? "true" : undefined}
      className="mn-board-stage"
    >
      <BoardPrintHeader
        projectTitle={projectTitle}
        activeSeason={activeSeason}
        summary={summary}
        hasActiveFilter={hasActiveFilter}
      />
      <main ref={viewportRef} aria-label={label} className="mn-board-viewport">
        <BoardGrid {...gridProps} />
      </main>
      <BoardEdgeScrollers
        canScrollStart={scrollState.scrolledX}
        canScrollEnd={scrollState.overflowEnd}
        onScrollEpisodes={onScrollEpisodes}
      />
    </div>
  );
}
