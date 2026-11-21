// The Tour tab: the scenarios this build can show, in their groups, each with its progress and its set-up.
import {
  SEED_DOCS,
  TOUR,
  heavyHomes,
  isShown,
  seedProject,
} from "@manent/demo";
import type { TourScenario } from "@manent/demo";
import { projectHome } from "@manent/sync-protocol";
import type { WorkspaceRef } from "@manent/sync-protocol";
import { TOUR_WORDS } from "@manent/ui";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { Api } from "../api.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { createTourProgress } from "./tour-progress.ts";
import { TourScenarioRow } from "./tour-scenario.tsx";
import type { SetupHold } from "./tour-scenario.tsx";
import { runSetup } from "./tour-setup.ts";
import type { SetupOutcome } from "./tour-setup.ts";
import { POLL_MS } from "./use-demo.ts";

const HEAVY_SEEDING_QUERY = "tour-heavy-seeding";

const SET_UP_FAILED: SetupOutcome = Object.freeze({
  ok: false,
  reason: "unknown",
});

/** `open` with `?person=<userId>` added, which the app reads to make the tab that person. */
function asPerson(open: string, userId: string): string {
  const url = new URL(open, "http://manent.invalid");
  url.searchParams.set("person", userId);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Whether the document the scenario opens lives in one of Lanternfield Studios' homes. */
function isInHeavyHome(
  scenario: TourScenario,
  homes: ReadonlySet<string>,
): boolean {
  const doc = SEED_DOCS.find((d) => `/s/${d.docId}` === scenario.setup.open);
  return (
    doc !== undefined &&
    homes.has(projectHome(seedProject(doc.projectKey).projectId))
  );
}

const LISTED = Object.freeze(TOUR.scenarios.filter(isShown));

/** The ids of the listed scenarios that wait while Lanternfield Studios is getting ready. */
const HEAVY_LISTED: readonly string[] = (() => {
  const homes = heavyHomes();
  return Object.freeze(
    LISTED.filter((s) => isInHeavyHome(s, homes)).map((s) => s.id),
  );
})();

/**
 * Lanternfield Studios as `/api/me` lists it while `enabled`, asked again every `POLL_MS` while it is getting ready;
 * null for a person with no session, whom the server does not answer.
 */
function useHeavyWorkspace(
  api: Api,
  userId: string,
  enabled: boolean,
): WorkspaceRef | null {
  return (
    useQuery({
      queryKey: [HEAVY_SEEDING_QUERY, userId],
      queryFn: async () => {
        const answer = await api.me();
        if (!answer.ok) return null;
        return answer.me.workspaces.find((w) => w.id === "heavy") ?? null;
      },
      enabled,
      refetchInterval: (query) => {
        const seeding = query.state.data?.seeding ?? null;
        return seeding !== null && !seeding.failed ? POLL_MS : false;
      },
    }).data ?? null
  );
}

/** Lists only the scenarios `isShown` passes, and draws no group that lists none. Never takes focus. */
export function TourPanel(): ReactNode {
  const services = useServices();
  const { where, now } = useEnvironment();
  const router = useRouter();
  const progress = useMemo(() => createTourProgress(services.tour), [services]);
  const heavy = useHeavyWorkspace(
    services.api,
    services.userId,
    HEAVY_LISTED.length > 0,
  );
  // the ids of the scenarios done, as one string: a snapshot equal while nothing changes
  const doneIds = useSyncExternalStore(progress.subscribe, () =>
    LISTED.filter((s) => progress.done(s.id))
      .map((s) => s.id)
      .join(" "),
  ).split(" ");

  const holdOf = (scenario: TourScenario): SetupHold | null => {
    if (scenario.setup.shell === "desktop" && where.shell !== "desktop")
      return { kind: "desktop_only" };
    const seeding = heavy?.seeding ?? null;
    if (heavy === null || seeding === null || seeding.failed) return null;
    if (!HEAVY_LISTED.includes(scenario.id)) return null;
    const { done, total } = seeding;
    return { kind: "seeding", workspace: heavy.name, done, total };
  };

  const setUp = (scenario: TourScenario): Promise<SetupOutcome> =>
    runSetup(scenario, {
      prepare: (id) => services.api.prepareTour(id),
      async switchPerson(userId) {
        if (userId === services.userId) return;
        // to the page the set-up opens next, so the person's first screen is that page
        await router.navigate({ href: asPerson(scenario.setup.open, userId) });
      },
      navigate: (path) => void router.navigate({ href: path }),
      openWindow(url) {
        if (window.open(url) === null)
          throw new Error("the browser refused one of the scenario's windows");
      },
    }).catch(
      // a window the browser refused: the scenario says it could not be set up
      () => SET_UP_FAILED,
    );

  return (
    <div className="flex flex-col gap-4 p-3">
      <h2 className="text-title">{TOUR_WORDS.title}</h2>
      {TOUR.groups.map((group) => {
        const scenarios = LISTED.filter((s) => s.group === group);
        if (scenarios.length === 0) return null;
        return (
          <section key={group} className="flex flex-col gap-2">
            <h3 className="text-micro font-semibold tracking-wide text-fg-muted uppercase">
              {group}
            </h3>
            <ul className="flex flex-col gap-4">
              {scenarios.map((scenario) => (
                <TourScenarioRow
                  key={scenario.id}
                  scenario={scenario}
                  hold={holdOf(scenario)}
                  done={doneIds.includes(scenario.id)}
                  onDone={(done) => progress.mark(scenario.id, done, now())}
                  setUp={setUp}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
