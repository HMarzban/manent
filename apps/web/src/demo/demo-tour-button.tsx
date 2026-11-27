// Tour toggle with a circular SVG progress ring while preserving the exact `"Tour"` accessible name.
import { CommandButton } from "@manent/ui";
import type { ReactNode } from "react";
import { usePanel } from "../state/panels.store.ts";
import { useTourActive } from "../state/tour.store.ts";
import type { TourProgressSnapshot } from "./use-tour-progress.ts";

const RING_RADIUS = 5.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function TourButton(props: {
  readonly progress: TourProgressSnapshot;
}): ReactNode {
  const { progress } = props;
  const showing = usePanel("side").tab === "tour";
  const active = useTourActive() !== null;

  // Show the achievable 6-part Highlights arc first; graduate to full Tour count once all Highlights are verified
  const graduated = progress.highlightsDone >= progress.highlightsTotal;
  const doneCount = graduated ? progress.doneCount : progress.highlightsDone;
  const total = graduated ? progress.totalCount : progress.highlightsTotal;
  const ratio = total === 0 ? 0 : Math.min(1, doneCount / total);
  const dashOffset = RING_CIRCUMFERENCE * (1 - ratio);

  return (
    <div className="flex shrink-0 items-center gap-1">
      <CommandButton
        id="demo.tour"
        variant="ghost"
        size="sm"
        className="h-7 rounded-full px-2 font-medium"
        icon={
          <span className="relative inline-flex items-center">
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              className="-rotate-90"
            >
              <circle
                cx="7"
                cy="7"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="1.8"
                className="mn-demo-ring-track"
              />
              <circle
                cx="7"
                cy="7"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE.toFixed(2)}
                strokeDashoffset={dashOffset.toFixed(2)}
                className="mn-demo-ring-fill"
              />
            </svg>
            {active && !showing ? (
              <span
                aria-hidden="true"
                className="mn-demo-dot absolute -end-0.5 -top-0.5"
                data-tone="accent"
              />
            ) : null}
          </span>
        }
        pressed={showing}
      />
      {total > 0 ? (
        <span
          aria-hidden="true"
          className="hidden text-micro text-fg-muted tabular-nums lg:inline"
        >
          {doneCount}/{total}
        </span>
      ) : null}
    </div>
  );
}
