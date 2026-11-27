// Layout-matched loading skeletons for Send forms and page preview tiles.
import { Skeleton } from "@manent/ui";
import type { CSSProperties, ReactNode } from "react";

export const SEND_PAIR_CLASS =
  "mx-auto flex w-fit max-w-full flex-col gap-8 p-6 @min-[68.75rem]:flex-row @min-[68.75rem]:items-start";

const SKELETON_TILES = 4;
const TILE_SCALE = 0.085;
// US Letter proportions (612 × 792 pt) scaled to tile size
const PLACEHOLDER_FRAME: CSSProperties = Object.freeze({
  width: `${612 * TILE_SCALE}pt`,
  height: `${792 * TILE_SCALE}pt`,
});

/** Realistic page-aspect skeleton tiles while the script's pagination is still loading. */
export function PageTilesSkeleton(): ReactNode {
  return (
    <div aria-busy="true" className="flex flex-wrap gap-x-2 gap-y-3">
      {Array.from({ length: SKELETON_TILES }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex flex-col items-center gap-1"
        >
          <Skeleton className="rounded-none" style={PLACEHOLDER_FRAME} />
          <Skeleton className="h-3 w-4" />
        </div>
      ))}
    </div>
  );
}

/** Structured form placeholder matching SendFrame's raised archival card layout while loading. */
export function SendFormSkeleton(props: { rows?: number }): ReactNode {
  const rowCount = props.rows ?? 3;
  return (
    <div
      aria-busy="true"
      className="@container min-h-0 flex-1 overflow-auto bg-chrome"
    >
      <div className={SEND_PAIR_CLASS}>
        <div
          aria-hidden="true"
          className="flex w-content max-w-full min-w-0 flex-col divide-y divide-line rounded-surface border border-line bg-raised"
        >
          {Array.from({ length: rowCount }, (_, index) => (
            <div key={index} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="h-3.5 w-key shrink-0" />
              <Skeleton className="h-control flex-1" />
            </div>
          ))}
          <div className="flex justify-end px-5 py-4">
            <Skeleton className="h-control-lg w-32" />
          </div>
        </div>
        <div
          aria-hidden="true"
          className="w-preview max-w-full shrink-0 rounded-surface border border-line bg-desk p-4"
        >
          <div className="flex flex-wrap gap-x-2 gap-y-3">
            {Array.from({ length: SKELETON_TILES }, (_, index) => (
              <Skeleton key={index} className="h-24 w-16 rounded-none" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
