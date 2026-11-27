// Concept A Smart Director's Rail: Desk, screen-aware Mission Pill, contextual 1-click actions, Live Instrument,
// Unified 432 px Stage Sheet (Controls + Tour Story Tracks), Tour ring and top-centre collapse.
import { DEMO_WORDS, useCommandState, useSubscribable } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useCallback, useContext, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { ConnectionMode } from "../services/sync/device-memory.ts";
import { asUiSubscribable } from "../services/sync/subscribable.ts";
import type { TabPerson } from "../session.ts";
import { routeHasTourPanel } from "../shell/shell-screens.ts";
import { TitleBarDivider } from "../shell/title-bar-pieces.tsx";
import { FactsContext } from "../state/bridge-contexts.ts";
import { panelsActions } from "../state/panels.store.ts";
import {
  tourActions,
  useTourActive,
  useTourBlockedUrl,
  useTourTrack,
  useTourVerified,
} from "../state/tour.store.ts";
import { serverStatusText } from "../text.ts";
import { useConnectionControl } from "./connection.tsx";
import { useDemoWindowActions, useLaunchTourById } from "./demo-actions.ts";
import { useDemoContext } from "./demo-context.ts";
import { DeskControl } from "./demo-desk-control.tsx";
import { StageSheet } from "./demo-lab.tsx";
import type { StageSheetTab } from "./demo-lab.tsx";
import {
  ContextualQuickActions,
  DemoMissionPill,
} from "./demo-mission-pill.tsx";
import {
  useActiveDemoTourTarget,
  useBarSurfaceSync,
  useTourPopoverSync,
  useWritingFocusAttr,
} from "./demo-stage-hooks.ts";
import { TourButton } from "./demo-tour-button.tsx";
import {
  ActiveWritersPill,
  CollapsedDemoTab,
  HideDemoBarButton,
  PreShellControls,
  ServerStatusControl,
  useCollapsedDemoBar,
} from "./server-status-control.tsx";
import { LiveInstrument, useLiveKeystrokeP50 } from "./timings.tsx";
import { useServerState } from "./use-demo.ts";
import type { DemoControl } from "./use-demo.ts";
import { useDemoMissionWatcher } from "./use-demo-watcher.ts";
import { LISTED_TOUR_SCENARIOS, useTourProgress } from "./use-tour-progress.ts";
import { useScriptWriters } from "./writers-control.tsx";

const ONLINE: Subscribable<ConnectionMode> = Object.freeze({
  get: () => "online",
  subscribe: () => () => {},
});

type DemoPopover = "desk" | "live" | "lab" | null;

export function DemoBarControls(props: {
  person: TabPerson | null;
  onPersonClick: () => void;
  control: DemoControl | null;
  resetting: boolean;
  barRef?: RefObject<HTMLElement | null>;
}): ReactNode {
  const inShell = useContext(FactsContext) !== null;
  const { control, person, onPersonClick, resetting, barRef } = props;
  if (inShell && person !== null) {
    return (
      <ShellControls
        person={person}
        onPersonClick={onPersonClick}
        control={control}
        barRef={barRef}
      />
    );
  }
  return (
    <PreShellControls
      person={person}
      onPersonClick={onPersonClick}
      control={control}
      resetting={resetting}
      barRef={barRef}
    />
  );
}

function ShellControls(props: {
  person: TabPerson;
  onPersonClick: () => void;
  control: DemoControl | null;
  barRef?: RefObject<HTMLElement | null>;
}): ReactNode {
  const { person, onPersonClick, control, barRef } = props;
  const connection = useConnectionControl();
  const mode = useSubscribable(
    connection === null ? ONLINE : asUiSubscribable(connection.mode),
  );
  const offline = mode === "offline";
  const slow = mode === "slow";
  const server = useServerState(control);
  const serverStopped = server === "stopped" || server === "failed";
  const unreachable = offline
    ? DEMO_WORDS.needsConnection
    : server === null || server === "running"
      ? null
      : DEMO_WORDS.needsServer;

  const progress = useTourProgress();
  const active = useTourActive();
  const activeTrackId = useTourTrack();
  const verifiedNotice = useTourVerified();
  const blockedWindowUrl = useTourBlockedUrl();
  const ctx = useDemoContext({
    userId: person.userId,
    activeTrackId,
    doneSet: progress.doneSet,
  });
  const { docId } = ctx;
  const signedIn = !useCommandState("app.signInToSync").visible;
  const keystrokeP50 = useLiveKeystrokeP50();
  const activeDemoTarget = useActiveDemoTourTarget();
  const writers = useScriptWriters({ docId, signedIn, unreachable });
  const writersCount = writers.running?.count ?? 0;

  const { launchScenario, startTrack } = useLaunchTourById({
    openSidePanel: true,
    connection,
    control,
    autoRecover: true,
  });

  useDemoMissionWatcher({
    mode,
    serverStopped,
    writersCount,
    keystrokeP50,
    activeScenarioId: active?.scenarioId ?? null,
    activeTrackId,
    doneSet: progress.doneSet,
    mark: progress.mark,
    nextAfter: progress.nextAfter,
  });

  const [openPopover, setOpenPopover] = useState<DemoPopover>(null);
  const [stageTab, setStageTab] = useState<StageSheetTab>("controls");
  const [collapsed, persistCollapsed] = useCollapsedDemoBar();

  const closePopover = useCallback(() => setOpenPopover(null), []);
  const clearBlocked = useCallback(
    () => tourActions.setBlockedWindow(null),
    [],
  );

  useTourPopoverSync({
    activeDemoTarget,
    collapsed,
    serverStopped,
    onExpand: useCallback(() => persistCollapsed(false), [persistCollapsed]),
    onOpenLive: useCallback(() => setOpenPopover("live"), []),
    onOpenLabControls: useCallback(() => {
      setStageTab("controls");
      setOpenPopover("lab");
    }, []),
    onClose: closePopover,
  });

  const degraded = offline || slow || serverStopped;
  const isCollapsed = collapsed && !degraded;
  const edge = serverStopped ? "danger" : offline || slow ? "attention" : null;

  useBarSurfaceSync(barRef, edge, isCollapsed);
  useWritingFocusAttr(barRef, degraded || openPopover !== null || isCollapsed);

  const { openSecondWindow, switchInPlace, openPath } = useDemoWindowActions({
    currentUserId: person.userId,
    companion: ctx.companion,
    companionTargetPath: ctx.companionTargetPath,
    companionNeedsSharedScript: ctx.companionNeedsSharedScript,
  });

  const handleToggleWriters = useCallback(() => {
    if (docId !== null && signedIn && writers.canEdit && unreachable === null) {
      writers.ask(writersCount > 0 ? 0 : 5, "own_scenes");
    } else {
      void launchScenario("together-add-writers", activeTrackId);
    }
  }, [
    docId,
    signedIn,
    writers,
    writersCount,
    unreachable,
    launchScenario,
    activeTrackId,
  ]);

  const activeScenario =
    active === null
      ? null
      : (LISTED_TOUR_SCENARIOS.find((s) => s.id === active.scenarioId) ?? null);

  const serverReadout =
    control !== null && (!serverStopped || isCollapsed) ? (
      <span data-slot="bar-status" className="sr-only">
        {server && serverStatusText(server)}
      </span>
    ) : null;

  if (isCollapsed) {
    return (
      <>
        {serverReadout}
        <CollapsedDemoTab
          keystrokeP50={keystrokeP50}
          onExpand={() => persistCollapsed(false)}
        />
      </>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 sm:gap-2">
      {serverReadout}

      <DeskControl
        person={person}
        companion={ctx.companion}
        serverStopped={serverStopped}
        blockedWindowUrl={blockedWindowUrl}
        open={openPopover === "desk"}
        onOpenChange={(next) => setOpenPopover(next ? "desk" : null)}
        onSwitchInPlace={(userId) => {
          closePopover();
          switchInPlace(userId);
        }}
        onOpenSecondWindow={() => {
          closePopover();
          openSecondWindow();
        }}
        onDismissBlocked={clearBlocked}
        onAllPeople={() => {
          closePopover();
          onPersonClick();
        }}
      />

      <TitleBarDivider className="hidden sm:block" />

      <DemoMissionPill
        blockedWindowUrl={blockedWindowUrl}
        verifiedNotice={verifiedNotice}
        offline={offline}
        active={active}
        activeScenario={activeScenario}
        suggestedScenario={ctx.suggestedScenario}
        isLibrary={ctx.screenMode === "library"}
        onDismissBlocked={clearBlocked}
        onReconnect={() => connection?.set("online")}
        onOpenToursTab={() => {
          setStageTab("tours");
          setOpenPopover("lab");
        }}
        onStartSuggested={() => {
          closePopover();
          void launchScenario(ctx.suggestedScenario.id, activeTrackId);
        }}
        onNextVerified={(scenarioId) => {
          tourActions.setVerified(null);
          void launchScenario(scenarioId, activeTrackId);
        }}
        onOpenActiveTour={() => {
          if (activeScenario !== null) tourActions.select(activeScenario.id);
          if (routeHasTourPanel(ctx.routeId))
            panelsActions.open("side", "tour");
          else {
            setStageTab("tours");
            setOpenPopover("lab");
          }
        }}
        onAdvanceActiveStep={() => {
          if (activeScenario === null || active === null) return;
          tourActions.open(
            activeScenario.id,
            Math.min(activeScenario.steps.length - 1, active.step + 1),
          );
        }}
      />

      <ContextualQuickActions
        screenMode={ctx.screenMode}
        offline={offline}
        writersCount={writersCount}
        hasConnection={connection !== null}
        onToggleOffline={() => connection?.set(offline ? "online" : "offline")}
        onToggleWriters={handleToggleWriters}
        onOpenSecondWindow={openSecondWindow}
        onLaunch={(id) => void launchScenario(id, activeTrackId)}
      />

      {serverStopped && control !== null ? (
        <ServerStatusControl {...control} resetting={false} inline />
      ) : (
        <LiveInstrument
          docId={docId}
          connection={connection}
          mode={mode}
          serverStopped={serverStopped}
          keystrokeP50={keystrokeP50}
          missionShowsReconnect={
            offline && blockedWindowUrl === null && verifiedNotice === null
          }
          open={openPopover === "live"}
          onOpenChange={(next) => setOpenPopover(next ? "live" : null)}
        />
      )}

      {writersCount > 0 ? (
        <ActiveWritersPill
          count={writersCount}
          pending={writers.pending}
          onStop={() => writers.ask(0, "own_scenes")}
        />
      ) : null}

      <div className="ms-auto flex shrink-0 items-center gap-1">
        <StageSheet
          docId={docId}
          signedIn={signedIn}
          unreachable={unreachable}
          connection={connection}
          control={control}
          keystrokeP50={keystrokeP50}
          serverStopped={serverStopped}
          companionName={ctx.companion.name}
          blockedWindowUrl={blockedWindowUrl}
          progress={progress}
          activeTrackId={activeTrackId}
          open={openPopover === "lab"}
          tab={stageTab}
          sidePanelOpen={ctx.sideTab !== null}
          onOpenChange={(next) => {
            if (next && openPopover !== "lab") setStageTab("controls");
            setOpenPopover(next ? "lab" : null);
          }}
          onTabChange={setStageTab}
          onOpenSecondWindow={() => {
            closePopover();
            openSecondWindow();
          }}
          onDismissBlocked={clearBlocked}
          onOpenScript={() => {
            closePopover();
            void launchScenario("offline-write", activeTrackId);
          }}
          onStartTrack={(trackId) => {
            closePopover();
            void startTrack(trackId, progress.doneSet);
          }}
          onOpenPath={(href) => {
            closePopover();
            openPath(href);
          }}
          onOpenTour={() => {
            closePopover();
            if (routeHasTourPanel(ctx.routeId))
              panelsActions.open("side", "tour");
            else void launchScenario(ctx.suggestedScenario.id, activeTrackId);
          }}
          onHideDemoBar={() => {
            closePopover();
            persistCollapsed(true);
          }}
        />

        <TitleBarDivider />

        <TourButton progress={progress} />

        <HideDemoBarButton
          onHide={() => {
            closePopover();
            persistCollapsed(true);
          }}
        />
      </div>
    </div>
  );
}
