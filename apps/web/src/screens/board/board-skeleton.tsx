// Accessible layout-matched skeleton loader for the Board screen (live status kept outside aria-busy).
import { DOCUMENT_WORDS, Skeleton } from "@manent/ui";
import type { ReactNode } from "react";

const SKELETON_COLS = [0, 1, 2, 3] as const;
const SKELETON_ROWS = [0, 1, 2] as const;

export function BoardGridSkeleton(): ReactNode {
  return (
    <>
      <p role="status" className="sr-only">
        {DOCUMENT_WORDS.opening}
      </p>
      <div aria-busy="true" className="mn-board-stage">
        <div aria-hidden="true" className="mn-board-viewport">
          <div
            style={{
              gridTemplateColumns:
                "var(--board-rail-w) repeat(4, minmax(var(--board-ep-w), var(--board-ep-max)))",
            }}
            className="mn-board-grid"
          >
            <div className="mn-board-corner flex min-h-row items-center px-2.5 py-2">
              <Skeleton className="h-3 w-16" />
            </div>
            {SKELETON_COLS.map((col) => (
              <div
                key={col}
                className="mn-board-ep-head flex flex-col gap-1.5 px-2.5 py-2"
              >
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-8 shrink-0" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3 w-10" />
                </div>
              </div>
            ))}
            {SKELETON_ROWS.map((row) => (
              <div key={row} className="contents">
                <div
                  data-lane={(row % 10) + 1}
                  className="mn-board-rail flex flex-col gap-2 px-2.5 py-3"
                >
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
                {SKELETON_COLS.map((col) => (
                  <div key={`${row}:${col}`} className="mn-board-cell">
                    <div
                      data-lane={(row % 10) + 1}
                      className="mn-card mn-board-card flex flex-col gap-1.5"
                    >
                      <Skeleton className="h-3.5 w-4/5" />
                      <Skeleton className="h-3 w-3/5" />
                    </div>
                    {col % 2 === row % 2 ? (
                      <div
                        data-lane={(row % 10) + 1}
                        className="mn-card mn-board-card flex flex-col gap-1.5"
                      >
                        <Skeleton className="h-3.5 w-3/4" />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
