// Single shared Tour progress hook over the person's private index and browser-level demo mirror.
import {
  TOUR,
  TOUR_HIGHLIGHTS,
  TOUR_TRACKS,
  findTourTrack,
  isShown,
} from "@manent/demo";
import type { TourScenario, TourTrackId } from "@manent/demo";
import { DEMO_WORDS } from "@manent/ui";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import { createLocalMap } from "../services/local-map.ts";
import { TOUR_SHARED_KEY, createTourProgress } from "./tour-progress.ts";

export const LISTED_TOUR_SCENARIOS: readonly TourScenario[] = Object.freeze(
  TOUR.scenarios.filter(isShown),
);

const TRACK_COPY: Readonly<
  Record<TourTrackId, { readonly title: string; readonly body: string }>
> = Object.freeze({
  overview: {
    title: DEMO_WORDS.trackOverviewTitle,
    body: DEMO_WORDS.trackOverviewBody,
  },
  screenwriter: {
    title: DEMO_WORDS.trackScreenwriterTitle,
    body: DEMO_WORDS.trackScreenwriterBody,
  },
  showrunner: {
    title: DEMO_WORDS.trackShowrunnerTitle,
    body: DEMO_WORDS.trackShowrunnerBody,
  },
  coordinator: {
    title: DEMO_WORDS.trackCoordinatorTitle,
    body: DEMO_WORDS.trackCoordinatorBody,
  },
  broadcast: {
    title: DEMO_WORDS.trackBroadcastTitle,
    body: DEMO_WORDS.trackBroadcastBody,
  },
  game: {
    title: DEMO_WORDS.trackGameTitle,
    body: DEMO_WORDS.trackGameBody,
  },
  resilience: {
    title: DEMO_WORDS.trackResilienceTitle,
    body: DEMO_WORDS.trackResilienceBody,
  },
});

/** Copy for a canonical Tour story track. */
export function tourTrackCopy(trackId: TourTrackId): {
  readonly title: string;
  readonly body: string;
} {
  return TRACK_COPY[trackId];
}

export interface TourProgressSnapshot {
  readonly listed: readonly TourScenario[];
  readonly doneSet: ReadonlySet<string>;
  readonly doneCount: number;
  readonly totalCount: number;
  readonly highlightsDone: number;
  readonly highlightsTotal: number;
  readonly mark: (scenarioId: string, done: boolean) => void;
  readonly trackStats: (trackId: TourTrackId) => {
    readonly done: number;
    readonly total: number;
    readonly nextScenarioId: string | null;
  };
  readonly nextAfter: (
    scenarioId: string,
    trackId: TourTrackId | null,
  ) => string | null;
}

/**
 * Shared reactive Tour progress across the Demo Bar, Unified Stage Sheet, Mission Watcher and Tour Panel.
 * Uses the person's private index mirrored to local demo storage so progress survives person switches.
 */
export function useTourProgress(
  scenarios: readonly TourScenario[] = LISTED_TOUR_SCENARIOS,
): TourProgressSnapshot {
  const services = useServices();
  const { now, storage, storageEvents } = useEnvironment();

  const shared = useMemo(
    () =>
      storage === null
        ? null
        : createLocalMap({
            storage,
            key: TOUR_SHARED_KEY,
            events: storageEvents,
          }),
    [storage, storageEvents],
  );
  useEffect(() => () => shared?.dispose(), [shared]);

  const progress = useMemo(
    () => createTourProgress(services.tour, shared),
    [services.tour, shared],
  );

  const doneSnapshot = useSyncExternalStore(progress.subscribe, () =>
    scenarios
      .filter((s) => progress.done(s.id))
      .map((s) => s.id)
      .join(" "),
  );

  const doneSet = useMemo(
    () => new Set(doneSnapshot === "" ? [] : doneSnapshot.split(" ")),
    [doneSnapshot],
  );

  const mark = useCallback(
    (scenarioId: string, done: boolean) => {
      progress.mark(scenarioId, done, now());
    },
    [progress, now],
  );

  const highlightsDone = useMemo(
    () => TOUR_HIGHLIGHTS.filter((id) => doneSet.has(id)).length,
    [doneSet],
  );

  const trackStats = useCallback(
    (trackId: TourTrackId) => {
      const track = findTourTrack(trackId) ?? TOUR_TRACKS[0]!;
      const done = track.scenarioIds.filter((id) => doneSet.has(id)).length;
      const nextScenarioId =
        track.scenarioIds.find((id) => !doneSet.has(id)) ??
        track.scenarioIds[0] ??
        null;
      return { done, total: track.scenarioIds.length, nextScenarioId };
    },
    [doneSet],
  );

  const nextAfter = useCallback(
    (scenarioId: string, trackId: TourTrackId | null): string | null => {
      const track = findTourTrack(trackId ?? "overview");
      const ids = track?.scenarioIds ?? TOUR_HIGHLIGHTS;
      const idx = ids.indexOf(scenarioId);
      const tail = idx === -1 ? ids : ids.slice(idx + 1);
      return (
        tail.find((id) => !doneSet.has(id)) ??
        ids.find((id) => id !== scenarioId && !doneSet.has(id)) ??
        null
      );
    },
    [doneSet],
  );

  return {
    listed: scenarios,
    doneSet,
    doneCount: doneSet.size,
    totalCount: scenarios.length,
    highlightsDone,
    highlightsTotal: TOUR_HIGHLIGHTS.length,
    mark,
    trackStats,
    nextAfter,
  };
}
