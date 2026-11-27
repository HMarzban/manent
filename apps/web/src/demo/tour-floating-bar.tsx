// Quiet floating Tour bar docked bottom-right ONLY while a Tour scenario is active and the side panel is closed.
import { TOUR, isShown } from "@manent/demo";
import type { TourScenario } from "@manent/demo";
import { Button, DOCUMENT_WORDS, TOUR_WORDS } from "@manent/ui";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  PanelRightIcon,
  XIcon,
} from "lucide-react";
import { useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import { routeHasTourPanel } from "../shell/shell-screens.ts";
import { panelsActions, usePanel } from "../state/panels.store.ts";
import {
  tourActions,
  useTourActive,
  useTourLocateNonce,
  useTourTrack,
} from "../state/tour.store.ts";
import { otherWindowNameOfStep } from "./tour-highlights.ts";
import { useTourRing } from "./tour-ring.ts";
import { tourTrackCopy } from "./use-tour-progress.ts";

const EMPTY_STEPS: TourScenario["steps"] = Object.freeze([]);
const FLOAT_GAP_PX = 16;

/**
 * Renders a compact, non-blocking floating step bar in the Archival Stone & Ochre demo scope while a scenario is running and the
 * Tour side panel is not showing, offsetting cleanly beside any other open side panel (Comments, History, Details).
 */
export function TourFloatingBar(props: {
  readonly routeId?: string;
}): ReactNode {
  const routeId = props.routeId;
  const hasTourPanel = routeId === undefined || routeHasTourPanel(routeId);
  const active = useTourActive();
  const activeTrackId = useTourTrack();
  const { tab: sideTab, widthPx } = usePanel("side");
  const railWidthPx =
    routeId === "/s/$docId/history" ? Math.max(300, widthPx) : null;
  const locateNonce = useTourLocateNonce();
  const showing = active !== null && (!hasTourPanel || sideTab !== "tour");
  const scenario =
    showing && active !== null
      ? (TOUR.scenarios.find((s) => s.id === active.scenarioId && isShown(s)) ??
        null)
      : null;
  const step =
    scenario !== null && active !== null
      ? (scenario.steps[active.step] ?? null)
      : null;
  const companion =
    scenario !== null && step !== null
      ? otherWindowNameOfStep(step.text, scenario)
      : null;

  // Clear a stale persisted scenario or out-of-range step rather than stranding the Demo bar's active indicator
  useEffect(() => {
    if (showing && (scenario === null || step === null)) tourActions.close();
  }, [showing, scenario, step]);

  useTourRing(
    scenario?.steps ?? EMPTY_STEPS,
    scenario !== null && active !== null ? active.step : null,
    showing && scenario !== null && step !== null && companion === null,
    locateNonce,
  );

  if (!showing || scenario === null || step === null || active === null)
    return null;

  const total = scenario.steps.length;
  const trackLabel =
    activeTrackId === null ? null : tourTrackCopy(activeTrackId).title;
  const offsetWidth =
    railWidthPx !== null
      ? railWidthPx
      : hasTourPanel && sideTab !== null
        ? widthPx
        : null;
  const position: CSSProperties | undefined =
    offsetWidth === null
      ? undefined
      : { insetInlineEnd: `${offsetWidth + FLOAT_GAP_PX}px` };

  return (
    <aside
      data-surface="demo"
      data-tour-chrome="true"
      aria-label={DOCUMENT_WORDS.tourTab}
      style={position}
      className="mn-tour-float fixed end-4 bottom-10 z-30 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-surface border border-line-strong bg-chrome p-3 text-ui text-fg"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-micro font-semibold tracking-wide text-fg-muted uppercase tabular-nums">
          <span className="shrink-0">
            {TOUR_WORDS.ofSteps(active.step + 1, total)}
          </span>
          {trackLabel !== null ? (
            <span className="mn-tag truncate normal-case">{trackLabel}</span>
          ) : null}
          {companion !== null ? (
            <span className="mn-tag shrink-0 gap-1 normal-case">
              <ExternalLinkIcon aria-hidden="true" className="size-3" />
              {TOUR_WORDS.inWindow(companion)}
            </span>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {hasTourPanel ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                tourActions.select(scenario.id);
                panelsActions.open("side", "tour");
              }}
            >
              <PanelRightIcon aria-hidden="true" className="size-icon" />
              {TOUR_WORDS.openTour}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={TOUR_WORDS.closeFloating}
            onClick={() => tourActions.close()}
          >
            <XIcon aria-hidden="true" className="size-icon" />
          </Button>
        </div>
      </div>

      <p className="text-meta text-fg">{step.text}</p>

      <div className="flex items-center justify-end gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={TOUR_WORDS.previous}
          disabled={active.step <= 0}
          onClick={() =>
            tourActions.open(scenario.id, Math.max(0, active.step - 1))
          }
        >
          <ChevronLeftIcon aria-hidden="true" className="size-icon" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={TOUR_WORDS.next}
          disabled={active.step >= total - 1}
          onClick={() =>
            tourActions.open(scenario.id, Math.min(total - 1, active.step + 1))
          }
        >
          <ChevronRightIcon aria-hidden="true" className="size-icon" />
        </Button>
      </div>
    </aside>
  );
}
