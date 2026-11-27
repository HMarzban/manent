// The Tour tab: coordinates shared progress, story tracks, set-up and switching between the Journey Hub and Focused Stepper.
import {
  SEED_DOCS,
  TOUR,
  findTourTrack,
  heavyHomes,
  isShown,
  seedProject,
} from "@manent/demo";
import type { TourGroup, TourScenario, TourTrackId } from "@manent/demo";
import { projectHome } from "@manent/sync-protocol";
import type { WorkspaceRef } from "@manent/sync-protocol";
import { Button, TOUR_WORDS } from "@manent/ui";
import { ChevronLeftIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Api } from "../api.ts";
import type { Where } from "../platform.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { useWorkspaces } from "../services/use-workspaces.ts";
import {
  tourActions,
  useTourActive,
  useTourSelected,
  useTourTrack,
} from "../state/tour.store.ts";
import { useLaunchTourById, useRunTourScenario } from "./demo-actions.ts";
import { TOUR_HIGHLIGHTS, isValidActiveTourStep } from "./tour-highlights.ts";
import { TourHub, TourProgressBar } from "./tour-hub.tsx";
import type { TourFilter } from "./tour-hub.tsx";
import { TourScenarioRow } from "./tour-scenario.tsx";
import type { SetupHold } from "./tour-scenario.tsx";
import { StepperFooter } from "./tour-stepper-chrome.tsx";
import {
  LISTED_TOUR_SCENARIOS,
  tourTrackCopy,
  useTourProgress,
} from "./use-tour-progress.ts";

const HIGHLIGHT_SET = new Set(TOUR_HIGHLIGHTS);

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

const SHOWN_GROUPS: readonly TourGroup[] = Object.freeze(
  TOUR.groups.filter((group) =>
    LISTED_TOUR_SCENARIOS.some((s) => s.group === group),
  ),
);

/** The ids of the listed scenarios that wait while Lanternfield Studios is getting ready. */
const HEAVY_LISTED: readonly string[] = (() => {
  const homes = heavyHomes();
  return Object.freeze(
    LISTED_TOUR_SCENARIOS.filter((s) => isInHeavyHome(s, homes)).map(
      (s) => s.id,
    ),
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

function defaultOpenGroup(
  shownGroups: readonly TourGroup[],
  listed: readonly TourScenario[],
  doneSet: ReadonlySet<string>,
): TourGroup | null {
  return (
    shownGroups.find((group) =>
      listed.some((s) => s.group === group && !doneSet.has(s.id)),
    ) ??
    shownGroups[0] ??
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
  activeTrackId: TourTrackId | null,
  pool: readonly TourScenario[],
  listed: readonly TourScenario[],
  doneSet: ReadonlySet<string>,
): TourScenario | null {
  const track = findTourTrack(activeTrackId);
  if (track !== null) {
    const idx = track.scenarioIds.indexOf(currentId);
    const tail =
      idx === -1 ? track.scenarioIds : track.scenarioIds.slice(idx + 1);
    const nextInTrack =
      tail.find((id) => !doneSet.has(id)) ??
      track.scenarioIds.find((id) => id !== currentId && !doneSet.has(id));
    if (nextInTrack !== undefined) {
      const found = listed.find((s) => s.id === nextInTrack);
      if (found !== undefined) return found;
    }
  }
  const list = pool.length > 0 ? pool : listed;
  const atIndex = list.findIndex((s) => s.id === currentId);
  const tail = atIndex === -1 ? list : list.slice(atIndex + 1);
  return (
    tail.find((s) => !doneSet.has(s.id)) ??
    list.find((s) => s.id !== currentId && !doneSet.has(s.id)) ??
    null
  );
}

export interface TourCatalog {
  readonly groups: readonly TourGroup[];
  readonly scenarios: readonly TourScenario[];
}

/** Lists only the scenarios `isShown` passes, and draws no group that lists none. Never takes focus. */
export function TourPanel(props?: {
  readonly docId?: string | null;
  readonly tour?: TourCatalog;
}): ReactNode {
  const tour = props?.tour ?? TOUR;
  const listed = useMemo(
    () =>
      tour === TOUR ? LISTED_TOUR_SCENARIOS : tour.scenarios.filter(isShown),
    [tour],
  );
  const shownGroups = useMemo(
    () =>
      tour === TOUR
        ? SHOWN_GROUPS
        : tour.groups.filter((group) => listed.some((s) => s.group === group)),
    [tour, listed],
  );
  const services = useServices();
  const { where, tabStorage } = useEnvironment();
  const setUp = useRunTourScenario({ openSidePanel: true });
  const { launchScenario } = useLaunchTourById({ openSidePanel: true });
  const active = useTourActive();
  const selectedId = useTourSelected();
  const activeTrackId = useTourTrack();
  const progress = useTourProgress(listed);
  const { doneSet } = progress;

  useEffect(() => {
    tourActions.hydrate(tabStorage, isValidActiveTourStep);
  }, [tabStorage]);

  const heavy = useHeavyWorkspace(
    services.api,
    services.userId,
    HEAVY_LISTED.length > 0,
  );

  const [filter, setFilter] = useState<TourFilter>("all");
  const [openGroups, setOpenGroups] = useState<ReadonlySet<TourGroup>>(() => {
    const initial = defaultOpenGroup(shownGroups, listed, doneSet);
    return initial === null ? new Set() : new Set([initial]);
  });

  const selected =
    selectedId === null
      ? null
      : (listed.find((s) => s.id === selectedId) ?? null);
  const activeScenario =
    active === null
      ? null
      : (listed.find((s) => s.id === active.scenarioId) ?? null);
  const visibleList = useMemo(
    () => listed.filter((s) => matchesFilter(s, filter, doneSet)),
    [listed, filter, doneSet],
  );

  const activeTrackBanner = useMemo(() => {
    if (activeTrackId === null) return null;
    const copy = tourTrackCopy(activeTrackId);
    const stats = progress.trackStats(activeTrackId);
    return {
      id: activeTrackId,
      title: copy.title,
      done: stats.done,
      total: stats.total,
      nextScenarioId: stats.nextScenarioId,
    };
  }, [activeTrackId, progress]);

  if (selected !== null) {
    const nextScenario = nextScenarioAfter(
      selected.id,
      activeTrackId,
      visibleList,
      listed,
      doneSet,
    );
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
          <TourProgressBar done={doneSet.size} total={listed.length} />
        </div>
        <TourScenarioRow
          key={selected.id}
          scenario={selected}
          hold={holdOf(selected, heavy, where.shell)}
          done={done}
          onDone={(ticked) => progress.mark(selected.id, ticked)}
          setUp={setUp}
          currentUserId={services.userId}
        />
        <StepperFooter
          scenario={selected}
          done={done}
          hasNextScenario={nextScenario !== null}
          onTickAndNext={() => {
            if (!done) progress.mark(selected.id, true);
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
      groups={shownGroups}
      listed={listed}
      visible={visibleList}
      doneSet={doneSet}
      filter={filter}
      openGroups={openGroups}
      active={active}
      activeScenario={activeScenario}
      activeTrack={activeTrackBanner}
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
      onStartNextInTrack={(id) => void launchScenario(id, activeTrackId)}
      onClearTrack={() => tourActions.setTrack(null)}
      onMark={(scenarioId, done) => {
        progress.mark(scenarioId, done);
        if (done && active?.scenarioId === scenarioId) tourActions.close();
      }}
    />
  );
}
