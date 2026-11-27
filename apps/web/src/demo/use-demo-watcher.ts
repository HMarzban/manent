// Accountable live auto-checkoff engine: observes low-frequency proof milestones and marks Tour scenarios verified.
import type { TourTrackId } from "@manent/demo";
import { readMarks } from "@manent/perf";
import { DEMO_WORDS } from "@manent/ui";
import { useCallback, useEffect, useRef } from "react";
import { useEnvironment } from "../services/context.tsx";
import type { ConnectionMode } from "../services/sync/device-memory.ts";
import { tourActions } from "../state/tour.store.ts";

const VERIFIED_BANNER_MS = 6_000;

function keystrokeSampleCount(): number {
  let count = 0;
  for (const record of readMarks()) {
    if (record.name === "editor.keystroke") count += 1;
  }
  return count;
}

/**
 * Watches low-frequency demo state transitions (zero keystroke-path renders) and automatically ticks the matching
 * Tour scenario with a calm confirmation notice and Next suggestion once the person completes the proof.
 */
export function useDemoMissionWatcher(options: {
  readonly mode: ConnectionMode;
  readonly serverStopped: boolean;
  readonly writersCount: number;
  readonly keystrokeP50: number | null;
  readonly activeScenarioId: string | null;
  readonly activeTrackId: TourTrackId | null;
  readonly doneSet: ReadonlySet<string>;
  readonly mark: (scenarioId: string, done: boolean) => void;
  readonly nextAfter: (
    scenarioId: string,
    trackId: TourTrackId | null,
  ) => string | null;
}): void {
  const {
    mode,
    serverStopped,
    writersCount,
    keystrokeP50,
    activeScenarioId,
    activeTrackId,
    doneSet,
    mark,
    nextAfter,
  } = options;
  const { schedule } = useEnvironment();

  const latestRef = useRef({
    activeScenarioId,
    activeTrackId,
    doneSet,
    mark,
    nextAfter,
  });
  latestRef.current = {
    activeScenarioId,
    activeTrackId,
    doneSet,
    mark,
    nextAfter,
  };

  const offlineStartMarks = useRef<number | null>(null);
  const stoppedStartMarks = useRef<number | null>(null);
  const writersStartMarks = useRef<number | null>(null);
  const clearTimer = useRef<(() => void) | null>(null);

  useEffect(() => () => clearTimer.current?.(), []);

  const announceVerified = useCallback(
    (scenarioId: string, text: string): void => {
      const latest = latestRef.current;
      if (!latest.doneSet.has(scenarioId)) latest.mark(scenarioId, true);
      if (latest.activeScenarioId === scenarioId) tourActions.close();
      const nextScenarioId = latest.nextAfter(scenarioId, latest.activeTrackId);
      tourActions.setVerified({ scenarioId, text, nextScenarioId });
      clearTimer.current?.();
      clearTimer.current = schedule(() => {
        tourActions.setVerified(null);
        clearTimer.current = null;
      }, VERIFIED_BANNER_MS);
    },
    [schedule],
  );

  // Proof 1: Offline survival (offline -> typed -> back online)
  useEffect(() => {
    if (mode === "offline") {
      if (offlineStartMarks.current === null)
        offlineStartMarks.current = keystrokeSampleCount();
      return;
    }
    if (mode === "online" && offlineStartMarks.current !== null) {
      const typed = keystrokeSampleCount() > offlineStartMarks.current;
      offlineStartMarks.current = null;
      if (typed) announceVerified("offline-write", DEMO_WORDS.verifiedOffline);
    }
  }, [mode, announceVerified]);

  // Proof 2: Server stop resilience (server stopped -> typed -> server back running)
  useEffect(() => {
    if (serverStopped) {
      if (stoppedStartMarks.current === null)
        stoppedStartMarks.current = keystrokeSampleCount();
      return;
    }
    if (stoppedStartMarks.current !== null) {
      const typed = keystrokeSampleCount() > stoppedStartMarks.current;
      stoppedStartMarks.current = null;
      if (typed)
        announceVerified("offline-server-stopped", DEMO_WORDS.verifiedServer);
    }
  }, [serverStopped, announceVerified]);

  // Proof 3: Live writers under load (writers running -> user typed and measured keystroke p50)
  useEffect(() => {
    if (writersCount <= 0) {
      writersStartMarks.current = null;
      return;
    }
    if (writersStartMarks.current === null) {
      writersStartMarks.current = keystrokeSampleCount();
      return;
    }
    if (
      keystrokeP50 !== null &&
      keystrokeSampleCount() > writersStartMarks.current &&
      !latestRef.current.doneSet.has("together-add-writers")
    ) {
      writersStartMarks.current = keystrokeSampleCount();
      announceVerified(
        "together-add-writers",
        DEMO_WORDS.verifiedWriters(
          DEMO_WORDS.msShort(keystrokeP50),
          writersCount,
        ),
      );
    }
  }, [writersCount, keystrokeP50, announceVerified]);
}
