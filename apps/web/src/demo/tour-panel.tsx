// The Tour tab: coordinates shared progress, set-up and switching between the Journey Hub and Focused Stepper.
import {
  DEMO_PEOPLE,
  SEED_DOCS,
  TOUR,
  heavyHomes,
  isShown,
  seedProject,
} from "@manent/demo";
import type { TourGroup, TourScenario } from "@manent/demo";
import { projectHome } from "@manent/sync-protocol";
import type { WorkspaceRef } from "@manent/sync-protocol";
import { Button, TOUR_WORDS } from "@manent/ui";
import { useRouter } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { Api } from "../api.ts";
import type { Where } from "../platform.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { createLocalMap } from "../services/local-map.ts";
import { useWorkspaces } from "../services/use-workspaces.ts";
import { panelsActions } from "../state/panels.store.ts";
import {
  tourActions,
  useTourActive,
  useTourSelected,
} from "../state/tour.store.ts";
import { TOUR_HIGHLIGHTS } from "./tour-highlights.ts";
import { TourHub, TourProgressBar } from "./tour-hub.tsx";
import type { TourFilter } from "./tour-hub.tsx";
import { TOUR_SHARED_KEY, createTourProgress } from "./tour-progress.ts";
import { TourScenarioRow } from "./tour-scenario.tsx";
import type { SetupHold } from "./tour-scenario.tsx";
import { runSetup } from "./tour-setup.ts";
import type { SetupOutcome } from "./tour-setup.ts";
import { StepperFooter } from "./tour-stepper-chrome.tsx";

const SET_UP_FAILED: SetupOutcome = Object.freeze({
  ok: false,
  reason: "unknown",
});

const HIGHLIGHT_SET = new Set(TOUR_HIGHLIGHTS);

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
const SHOWN_GROUPS: readonly TourGroup[] = Object.freeze(
  TOUR.groups.filter((group) => LISTED.some((s) => s.group === group)),
);

const isValidActive = (scenarioId: string, step: number): boolean => {
  const scenario = LISTED.find((s) => s.id === scenarioId);
  return scenario !== undefined && step < scenario.steps.length;
};

/** The ids of the listed scenarios that wait while Lanternfield Studios is getting ready. */
const HEAVY_LISTED: readonly string[] = (() => {
  const homes = heavyHomes();
  return Object.freeze(
    LISTED.filter((s) => isInHeavyHome(s, homes)).map((s) => s.id),
  );
})();

/** Lanternfield Studios as the person's workspaces list it while `enabled`; null until they are known. */
function useHeavyWorkspace(
  api: Api,
  userId: string,
  enabled: boolean,
): WorkspaceRef | null {
  const { data } = useWorkspaces(api, userId, enabled);
  return data?.find((w) => w.id === "heavy") ?? null;
}

/** What keeps the scenario from being set up in `shell` while Lanternfield Studios is as `heavy` says; null when nothing does. */
function holdOf(
  scenario: TourScenario,
  heavy: WorkspaceRef | null,
  shell: Where["shell"],
): SetupHold | null {
  if (scenario.setup.shell === "desktop" && shell !== "desktop")
    return { kind: "desktop_only" };
  if (heavy?.seeding == null || !HEAVY_LISTED.includes(scenario.id))
    return null;
  const { done, total, failed } = heavy.seeding;
  return failed
    ? { kind: "seeding_failed", workspace: heavy.name }
    : { kind: "seeding", workspace: heavy.name, done, total };
}

/**
 * Set it up for this tab: the set-up's work done with the tab's services and router. Once it is set up the Tour shows
 * again, since the panels put back for the person the tab became may not show it, and a tab that became another person
 * says so in the message slot.
 */
function useScenarioSetUp(): (scenario: TourScenario) => Promise<SetupOutcome> {
  const services = useServices();
  const { personServices } = useEnvironment();
  const router = useRouter();
  return async (scenario) => {
    const outcome = await runSetup(scenario, {
      prepare: (id) => services.api.prepareTour(id),
      async switchPerson(userId) {
        if (userId === services.userId) return;
        // to the page the set-up opens next, so the person's first screen is that page
        await router.navigate({ href: asPerson(scenario.setup.open, userId) });
      },
      navigate: (path) => void router.navigate({ href: path }),
      openWindow: (url) => window.open(url) !== null,
    }).catch(() => SET_UP_FAILED);
    if (!outcome.ok) {
      if (outcome.reason === "popup_blocked")
        panelsActions.open("side", "tour");
      return outcome;
    }
    panelsActions.open("side", "tour");
    const person = DEMO_PEOPLE.find((p) => p.userId === scenario.setup.userId);
    const drawn = personServices.get();
    if (
      person !== undefined &&
      person.userId !== services.userId &&
      drawn?.userId === person.userId
    )
      drawn.messages.push({
        id: "tour_person",
        text: TOUR_WORDS.nowPerson(person.name),
        actions: [],
        lifetime: "brief",
        ownWork: false,
      });
    return outcome;
  };
}

function defaultOpenGroup(doneSet: ReadonlySet<string>): TourGroup | null {
  return (
    SHOWN_GROUPS.find((group) =>
      LISTED.some((s) => s.group === group && !doneSet.has(s.id)),
    ) ??
    SHOWN_GROUPS[0] ??
    null
  );
}

function matchesFilter(
  scenario: TourScenario,
  filter: TourFilter,
  doneSet: ReadonlySet<string>,
): boolean {
  if (filter === "highlights") return HIGHLIGHT_SET.has(scenario.id);
  if (filter === "remaining") return !doneSet.has(scenario.id);
  return true;
}

function nextScenarioAfter(
  currentId: string,
  pool: readonly TourScenario[],
  doneSet: ReadonlySet<string>,
): TourScenario | null {
  const list = pool.length > 0 ? pool : LISTED;
  const atIndex = list.findIndex((s) => s.id === currentId);
  const tail = atIndex === -1 ? list : list.slice(atIndex + 1);
  return (
    tail.find((s) => !doneSet.has(s.id)) ??
    list.find((s) => s.id !== currentId && !doneSet.has(s.id)) ??
    null
  );
}

/** Lists only the scenarios `isShown` passes, and draws no group that lists none. Never takes focus. */
export function TourPanel(): ReactNode {
  const services = useServices();
  const { where, now, storage, storageEvents, tabStorage } = useEnvironment();
  const setUp = useScenarioSetUp();
  const active = useTourActive();
  const selectedId = useTourSelected();

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
  useEffect(() => {
    tourActions.hydrate(tabStorage, isValidActive);
  }, [tabStorage]);

  const progress = useMemo(
    () => createTourProgress(services.tour, shared),
    [services, shared],
  );
  const heavy = useHeavyWorkspace(
    services.api,
    services.userId,
    HEAVY_LISTED.length > 0,
  );

  // the ids of the scenarios done, as one string: a snapshot equal while nothing changes
  const doneSnapshot = useSyncExternalStore(progress.subscribe, () =>
    LISTED.filter((s) => progress.done(s.id))
      .map((s) => s.id)
      .join(" "),
  );
  const doneSet = useMemo(
    () => new Set(doneSnapshot === "" ? [] : doneSnapshot.split(" ")),
    [doneSnapshot],
  );

  const [filter, setFilter] = useState<TourFilter>("all");
  const [openGroups, setOpenGroups] = useState<ReadonlySet<TourGroup>>(() => {
    const initial = defaultOpenGroup(doneSet);
    return initial === null ? new Set() : new Set([initial]);
  });

  const selected =
    selectedId === null
      ? null
      : (LISTED.find((s) => s.id === selectedId) ?? null);
  const activeScenario =
    active === null
      ? null
      : (LISTED.find((s) => s.id === active.scenarioId) ?? null);
  const visibleList = useMemo(
    () => LISTED.filter((s) => matchesFilter(s, filter, doneSet)),
    [filter, doneSet],
  );

  if (selected !== null) {
    const nextScenario = nextScenarioAfter(selected.id, visibleList, doneSet);
    const done = doneSet.has(selected.id);
    return (
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="-ms-2"
              onClick={() => tourActions.select(null)}
            >
              <ChevronLeftIcon aria-hidden="true" className="size-icon" />
              {TOUR_WORDS.allParts}
            </Button>
            <h2 className="truncate text-micro font-semibold tracking-wide text-fg-muted uppercase">
              {selected.group}
            </h2>
          </div>
          <TourProgressBar done={doneSet.size} total={LISTED.length} />
        </div>
        <TourScenarioRow
          key={selected.id}
          scenario={selected}
          hold={holdOf(selected, heavy, where.shell)}
          done={done}
          onDone={(ticked) => progress.mark(selected.id, ticked, now())}
          setUp={setUp}
          currentUserId={services.userId}
        />
        <StepperFooter
          scenario={selected}
          done={done}
          hasNextScenario={nextScenario !== null}
          onTickAndNext={() => {
            if (!done) progress.mark(selected.id, true, now());
            tourActions.close();
            tourActions.select(nextScenario?.id ?? null);
          }}
          onNextScenario={() => {
            tourActions.close();
            tourActions.select(nextScenario?.id ?? null);
          }}
        />
      </div>
    );
  }

  return (
    <TourHub
      groups={SHOWN_GROUPS}
      listed={LISTED}
      visible={visibleList}
      doneSet={doneSet}
      filter={filter}
      openGroups={openGroups}
      active={active}
      activeScenario={activeScenario}
      shell={where.shell}
      onFilter={setFilter}
      onToggleGroup={(group) =>
        setOpenGroups((prev) => {
          const next = new Set(prev);
          if (next.has(group)) next.delete(group);
          else next.add(group);
          return next;
        })
      }
      onSelect={(id) => tourActions.select(id)}
      onMark={(scenarioId, done) => {
        progress.mark(scenarioId, done, now());
        if (done && active?.scenarioId === scenarioId) tourActions.close();
      }}
    />
  );
}
