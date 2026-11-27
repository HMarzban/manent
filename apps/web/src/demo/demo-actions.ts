// Shared zero-dead-end Tour & Demo Stage action runner: set up scenarios, start tracks and recover blocked pop-ups.
import { DEMO_PEOPLE, findTourTrack } from "@manent/demo";
import type { DemoPerson, TourScenario, TourTrackId } from "@manent/demo";
import { DEMO_WORDS, TOUR_WORDS } from "@manent/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import { useAnnouncer } from "../shell/announcer-region.tsx";
import { routeHasTourPanel } from "../shell/shell-screens.ts";
import { panelsActions } from "../state/panels.store.ts";
import { tourActions } from "../state/tour.store.ts";
import type { ConnectionControl } from "./connection-transport.ts";
import { companionUrlFor } from "./demo-stage-hooks.ts";
import { runSetup } from "./tour-setup.ts";
import type { SetupOutcome } from "./tour-setup.ts";
import { SERVER_STATUS_QUERY } from "./use-demo.ts";
import type { DemoControl } from "./use-demo.ts";
import { LISTED_TOUR_SCENARIOS } from "./use-tour-progress.ts";

const SET_UP_FAILED: SetupOutcome = Object.freeze({
  ok: false,
  reason: "unknown",
});

/** `open` with `?person=<userId>` added, which the app reads to make the tab that person. */
export function asPersonPath(open: string, userId: string): string {
  const url = new URL(open, "http://manent.invalid");
  url.searchParams.set("person", userId);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Shared Tour scenario runner used by both the Tour Panel and Concept A's Demo Stage.
 * Records blocked companion URLs so a clickable link recovers pop-up blocks, and avoids redundant side-panel opens on
 * routes that use the floating step bar instead.
 */
export function useRunTourScenario(options?: {
  readonly openSidePanel?: boolean;
  readonly connection?: ConnectionControl | null;
  readonly control?: DemoControl | null;
  readonly autoRecover?: boolean;
}): (scenario: TourScenario) => Promise<SetupOutcome> {
  const openSidePanel = options?.openSidePanel ?? true;
  const connection = options?.connection ?? null;
  const control = options?.control ?? null;
  const autoRecover = options?.autoRecover ?? false;
  const services = useServices();
  const { personServices } = useEnvironment();
  const router = useRouter();
  const queryClient = useQueryClient();
  const announcer = useAnnouncer();

  return useCallback(
    async (scenario: TourScenario): Promise<SetupOutcome> => {
      tourActions.setBlockedWindow(null);

      // When launching from the Demo Bar, recover offline/stopped states automatically so evaluators hit zero dead ends
      if (autoRecover) {
        if (connection !== null && connection.mode.get() === "offline") {
          connection.set("online");
        }
        if (control !== null) {
          const cached = queryClient.getQueryData<string>([
            SERVER_STATUS_QUERY,
            control.id,
          ]);
          if (cached === "stopped" || cached === "failed") {
            try {
              await control.client.start();
              await queryClient.invalidateQueries({
                queryKey: [SERVER_STATUS_QUERY, control.id],
              });
            } catch {
              announcer.announce(DEMO_WORDS.serverRefused);
              return { ok: false, reason: "unreachable" };
            }
          }
        }
      }

      let switchedPerson = false;
      const outcome = await runSetup(scenario, {
        prepare: (id) => services.api.prepareTour(id),
        async switchPerson(userId) {
          if (userId === services.userId) return;
          switchedPerson = true;
          await router.navigate({
            href: asPersonPath(scenario.setup.open, userId),
          });
        },
        navigate(path) {
          if (!switchedPerson) void router.navigate({ href: path });
        },
        openWindow(url) {
          const opened = window.open(url, "_blank");
          if (opened === null) {
            tourActions.setBlockedWindow(url);
            announcer.announce(DEMO_WORDS.popupBlocked);
            return false;
          }
          return true;
        },
      }).catch(() => SET_UP_FAILED);

      if (!outcome.ok) {
        if (outcome.reason === "popup_blocked" && openSidePanel) {
          panelsActions.open("side", "tour");
        }
        return outcome;
      }

      const routeId = router.state.matches.at(-1)?.routeId ?? "/";
      if (openSidePanel && routeHasTourPanel(routeId)) {
        panelsActions.open("side", "tour");
      }

      const person = DEMO_PEOPLE.find(
        (p) => p.userId === scenario.setup.userId,
      );
      const drawn = personServices.get();
      if (
        person !== undefined &&
        person.userId !== services.userId &&
        drawn?.userId === person.userId
      ) {
        drawn.messages.push({
          id: "tour_person",
          text: TOUR_WORDS.nowPerson(person.name),
          actions: [],
          lifetime: "brief",
          ownWork: false,
        });
      }
      return outcome;
    },
    [
      autoRecover,
      connection,
      control,
      openSidePanel,
      services,
      personServices,
      router,
      queryClient,
      announcer,
    ],
  );
}

/** Launches a scenario by ID through the shared runner and opens step 0 cleanly. */
export function useLaunchTourById(options?: {
  readonly openSidePanel?: boolean;
  readonly connection?: ConnectionControl | null;
  readonly control?: DemoControl | null;
  readonly autoRecover?: boolean;
}): {
  readonly launchScenario: (
    scenarioId: string,
    trackId?: TourTrackId | null,
  ) => Promise<void>;
  readonly startTrack: (
    trackId: TourTrackId,
    doneSet: ReadonlySet<string>,
  ) => Promise<void>;
} {
  const run = useRunTourScenario(options);

  const launchScenario = useCallback(
    async (scenarioId: string, trackId?: TourTrackId | null) => {
      const scenario = LISTED_TOUR_SCENARIOS.find((s) => s.id === scenarioId);
      if (scenario === undefined) return;
      if (trackId !== undefined) tourActions.setTrack(trackId);
      tourActions.select(scenario.id);
      const outcome = await run(scenario);
      tourActions.setRefusal(scenario.id, outcome.ok ? null : outcome.reason);
      if (outcome.ok) tourActions.open(scenario.id, 0);
    },
    [run],
  );

  const startTrack = useCallback(
    async (trackId: TourTrackId, doneSet: ReadonlySet<string>) => {
      const track = findTourTrack(trackId);
      if (track === null) return;
      const firstId =
        track.scenarioIds.find((id) => !doneSet.has(id)) ??
        track.scenarioIds[0];
      if (firstId !== undefined) await launchScenario(firstId, trackId);
    },
    [launchScenario],
  );

  return { launchScenario, startTrack };
}

/** Companion window launcher and in-place person switcher with pop-up block recovery. */
export function useDemoWindowActions(options: {
  readonly currentUserId: string;
  readonly companion: DemoPerson;
  readonly companionTargetPath: string | null;
  readonly companionNeedsSharedScript: boolean;
}): {
  readonly openSecondWindow: () => void;
  readonly switchInPlace: (userId: string) => void;
  readonly openPath: (href: string) => void;
} {
  const {
    currentUserId,
    companion,
    companionTargetPath,
    companionNeedsSharedScript,
  } = options;
  const router = useRouter();
  const announcer = useAnnouncer();

  const openSecondWindow = useCallback(() => {
    const url = companionUrlFor(companion.userId, true, companionTargetPath);
    if (companionNeedsSharedScript && companionTargetPath !== null) {
      const ownHref =
        currentUserId === "you"
          ? asPersonPath(companionTargetPath, "dana")
          : companionTargetPath;
      void router.navigate({ href: ownHref });
    }
    if (window.open(url, "_blank") === null) {
      tourActions.setBlockedWindow(url);
      announcer.announce(DEMO_WORDS.popupBlocked);
    } else {
      tourActions.setBlockedWindow(null);
    }
  }, [
    companion.userId,
    companionTargetPath,
    companionNeedsSharedScript,
    currentUserId,
    router,
    announcer,
  ]);

  const switchInPlace = useCallback(
    (userId: string) => {
      if (userId !== currentUserId)
        void router.navigate({ href: companionUrlFor(userId, false) });
    },
    [currentUserId, router],
  );

  const openPath = useCallback(
    (href: string) => {
      void router.navigate({ href });
    },
    [router],
  );

  return { openSecondWindow, switchInPlace, openPath };
}
