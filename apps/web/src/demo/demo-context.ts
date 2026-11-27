// Zero-keystroke-cost smart context for the Demo Stage: active screen mode, workspace-safe companion and next mission.
import {
  DEMO_PEOPLE,
  DEMO_WORKSPACES,
  SEED_DOCS,
  SEED_PROJECTS,
  TOUR_HIGHLIGHTS,
  docPath,
  findTourTrack,
} from "@manent/demo";
import type { DemoPerson, TourScenario, TourTrackId } from "@manent/demo";
import type { ScreenId } from "@manent/commands";
import type { DocKind } from "@manent/sync-protocol";
import { useRouterState } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { ProjectKind, ShellState } from "../services/ports.ts";
import { LISTED_TOUR_SCENARIOS } from "./use-tour-progress.ts";

export type DemoScreenMode =
  | "library"
  | "screenplay"
  | "locked"
  | "board"
  | "rundown"
  | "ink"
  | "history"
  | "send"
  | "preferences"
  | "other";

export interface NarrowedShell {
  readonly screen: ScreenId;
  readonly docId: string | null;
  readonly sideTab: string | null;
}

const SLACK_WATER_PATH = docPath("medium/harbour-lights/205");
const LOCKED_SEED_KEYS = new Set<string>(["medium/the-long-night/script"]);

const SCREEN_SCENARIOS: Readonly<Record<DemoScreenMode, readonly string[]>> =
  Object.freeze({
    library: [
      "write-true-pages",
      "offline-write",
      "together-add-writers",
      "write-library-organise",
    ],
    screenplay: [
      "offline-write",
      "together-add-writers",
      "together-cursors",
      "write-true-pages",
    ],
    locked: [
      "production-locked-page",
      "production-issue-blue",
      "production-sides",
    ],
    board: ["write-board", "together-style", "together-present"],
    rundown: [
      "rundown-remote-prompter",
      "rundown-time",
      "rundown-feed-lost",
      "rundown-send",
    ],
    ink: ["write-ink-play", "write-ink-problem", "write-game-lines"],
    history: ["history-every-version", "history-restore-scene"],
    send: ["write-export", "production-sides"],
    preferences: ["write-library-organise", "together-workspace-settings"],
    other: TOUR_HIGHLIGHTS,
  });

/**
 * Narrowed subscription to `shellState` ignoring caret-driven `spaceBeforeSet` so typing never re-renders the Demo Bar.
 */
export function useNarrowedShellState(): NarrowedShell {
  const { shellState } = useEnvironment();
  const lastRef = useRef<NarrowedShell | null>(null);
  const read = useCallback((): NarrowedShell => {
    const raw: ShellState = shellState.get();
    const prev = lastRef.current;
    if (
      prev !== null &&
      prev.screen === raw.screen &&
      prev.docId === raw.docId &&
      prev.sideTab === raw.panels.side
    ) {
      return prev;
    }
    const next: NarrowedShell = {
      screen: raw.screen,
      docId: raw.docId,
      sideTab: raw.panels.side,
    };
    lastRef.current = next;
    return next;
  }, [shellState]);
  return useSyncExternalStore(shellState.subscribe, read, read);
}

function useDocKind(docId: string | null): DocKind | null {
  const { library } = useServices();
  const source = useMemo(
    () => (docId === null ? null : library.docKindOf(docId)),
    [library, docId],
  );
  return useSyncExternalStore(
    (cb) => source?.subscribe(cb) ?? (() => {}),
    () => source?.get() ?? null,
    () => null,
  );
}

function useDocProjectKind(docId: string | null): ProjectKind | null {
  const { library } = useServices();
  const source = useMemo(
    () => (docId === null ? null : library.documentKind(docId)),
    [library, docId],
  );
  return useSyncExternalStore(
    (cb) => source?.subscribe(cb) ?? (() => {}),
    () => source?.get() ?? null,
    () => null,
  );
}

/**
 * Picks a workspace-compatible companion person (never Dana → Sam on Lanternfield Studios, never Sam → Dana on Sam's desk)
 * and resolves the URL that guarantees a live shared script for two-window collaboration.
 */
export function resolveSmartCompanion(options: {
  readonly currentUserId: string;
  readonly docId: string | null;
  readonly screen: ScreenId;
}): {
  readonly person: DemoPerson;
  readonly targetPath: string | null;
  readonly needsSharedScript: boolean;
} {
  const { currentUserId, docId, screen } = options;
  const registered = DEMO_PEOPLE.filter((p) => p.registered);
  const seedDoc =
    docId === null ? undefined : SEED_DOCS.find((d) => d.docId === docId);
  const seedProj =
    seedDoc === undefined
      ? undefined
      : SEED_PROJECTS.find((p) => p.key === seedDoc.projectKey);
  const workspace =
    seedProj === undefined
      ? undefined
      : DEMO_WORKSPACES.find((w) => w.id === seedProj.workspaceId);

  if (workspace !== undefined && workspace.memberUserIds.length >= 2) {
    const peerId = workspace.memberUserIds.find((id) => id !== currentUserId);
    const peer =
      registered.find((p) => p.userId === peerId) ??
      registered.find((p) => p.userId !== currentUserId) ??
      registered[0]!;
    return { person: peer, targetPath: null, needsSharedScript: false };
  }

  const onSharedSurface =
    docId !== null &&
    currentUserId !== "you" &&
    (workspace === undefined || workspace.memberUserIds.length >= 2);
  const fallbackPeer =
    registered.find((p) => p.userId !== currentUserId) ?? registered[0]!;
  if (onSharedSurface && (screen === "document" || screen === "board")) {
    return { person: fallbackPeer, targetPath: null, needsSharedScript: false };
  }

  // On Library, Sam's solo desk or unsigned-in You, open the canonical shared script in both/companion window
  const sharedPeer =
    currentUserId === "dana"
      ? (registered.find((p) => p.userId === "sam") ?? fallbackPeer)
      : (registered.find((p) => p.userId === "dana") ?? fallbackPeer);
  return {
    person: sharedPeer,
    targetPath: SLACK_WATER_PATH,
    needsSharedScript: true,
  };
}

export interface DemoContext {
  readonly screen: ScreenId;
  readonly routeId: string;
  readonly docId: string | null;
  readonly sideTab: string | null;
  readonly docKind: DocKind | null;
  readonly projectKind: ProjectKind | null;
  readonly screenMode: DemoScreenMode;
  readonly companion: DemoPerson;
  readonly companionTargetPath: string | null;
  readonly companionNeedsSharedScript: boolean;
  readonly suggestedScenario: TourScenario;
}

/** Zero-keystroke-cost screen & story context for Concept A's Smart Director's Rail. */
export function useDemoContext(options: {
  readonly userId: string;
  readonly activeTrackId: TourTrackId | null;
  readonly doneSet: ReadonlySet<string>;
}): DemoContext {
  const { userId, activeTrackId, doneSet } = options;
  const shell = useNarrowedShellState();
  const routeId = useRouterState({
    select: (state): string => state.matches.at(-1)?.routeId ?? "/",
  });
  const docKind = useDocKind(shell.docId);
  const projectKind = useDocProjectKind(shell.docId);

  const screenMode: DemoScreenMode = useMemo(() => {
    if (routeId === "/s/$docId/history") return "history";
    if (shell.screen === "library") return "library";
    if (shell.screen === "board") return "board";
    if (shell.screen === "send") return "send";
    if (shell.screen === "preferences") return "preferences";
    if (shell.screen === "document") {
      if (docKind === "rundown") return "rundown";
      if (docKind === "ink" || projectKind === "game") return "ink";
      const seedDoc =
        shell.docId === null
          ? undefined
          : SEED_DOCS.find((d) => d.docId === shell.docId);
      if (seedDoc !== undefined && LOCKED_SEED_KEYS.has(seedDoc.key))
        return "locked";
      return "screenplay";
    }
    return "other";
  }, [routeId, shell.screen, shell.docId, docKind, projectKind]);

  const companionInfo = useMemo(
    () =>
      resolveSmartCompanion({
        currentUserId: userId,
        docId: shell.docId,
        screen: shell.screen,
      }),
    [userId, shell.docId, shell.screen],
  );

  const suggestedScenario = useMemo(() => {
    const byId = new Map(LISTED_TOUR_SCENARIOS.map((s) => [s.id, s]));
    const track = findTourTrack(activeTrackId);
    const candidates = [
      ...(track?.scenarioIds ?? []),
      ...SCREEN_SCENARIOS[screenMode],
      ...TOUR_HIGHLIGHTS,
    ];
    const unticked = candidates.find((id) => !doneSet.has(id) && byId.has(id));
    const chosenId = unticked ?? candidates[0] ?? TOUR_HIGHLIGHTS[0]!;
    return byId.get(chosenId) ?? LISTED_TOUR_SCENARIOS[0]!;
  }, [activeTrackId, screenMode, doneSet]);

  return {
    screen: shell.screen,
    routeId,
    docId: shell.docId,
    sideTab: shell.sideTab,
    docKind,
    projectKind,
    screenMode,
    companion: companionInfo.person,
    companionTargetPath: companionInfo.targetPath,
    companionNeedsSharedScript: companionInfo.needsSharedScript,
    suggestedScenario,
  };
}
