// Game Script player state machine: instant pure replay on live edits, scene jumping, Back/Restart, and Flag edits.
import { replayGameScript } from "@manent/schema";
import type {
  BlockJSON,
  GameChoiceOption,
  GameEditedFlag,
  GameFlag,
  GameFlagValue,
  GameRecordedChoice,
  GameSceneSummary,
  GameTranscriptItem,
} from "@manent/schema";
import type { InkPlaythroughStore } from "../../ink/player/storage.ts";

export interface GamePlayerSnapshot {
  readonly loaded: boolean;
  readonly started: boolean;
  readonly scenes: readonly GameSceneSummary[];
  readonly currentScene: GameSceneSummary | null;
  readonly startSceneId: string | null;
  readonly transcript: readonly GameTranscriptItem[];
  readonly choices: readonly GameChoiceOption[];
  readonly flags: readonly GameFlag[];
  readonly recordedChoices: readonly GameRecordedChoice[];
  readonly editedFlags: readonly GameEditedFlag[];
  readonly diverged: boolean;
  readonly ended: boolean;
  readonly focusNonce: number;
}

export interface GamePlayerController {
  snapshot(): GamePlayerSnapshot;
  subscribe(listener: () => void): () => void;
  setBlocks(blocks: readonly BlockJSON[]): void;
  play(): void;
  playFromScene(sceneId: string): void;
  selectScene(sceneId: string | null): void;
  choose(choice: GameChoiceOption): void;
  editFlag(name: string, value: GameFlagValue): void;
  back(): void;
  restart(): void;
  dispose(): void;
}

type GamePendingIntent =
  | { readonly kind: "play" }
  | { readonly kind: "scene"; readonly sceneId: string };

const activeGameControllers = new Map<string, GamePlayerController>();
const pendingGameIntents = new Map<string, GamePendingIntent>();

function hasRestartableProgress(snap: GamePlayerSnapshot): boolean {
  return (
    snap.recordedChoices.length > 0 ||
    snap.editedFlags.length > 0 ||
    snap.ended ||
    snap.startSceneId !== null
  );
}

/** Queues or triggers `Play` for `docId`'s Game Script player. */
export function triggerGamePlay(docId: string): void {
  const controller = activeGameControllers.get(docId);
  if (controller !== undefined) controller.play();
  else pendingGameIntents.set(docId, { kind: "play" });
}

/** Queues or triggers `Play from here` starting at `sceneId` for `docId`'s Game Script player. */
export function triggerGamePlayFromScene(docId: string, sceneId: string): void {
  const controller = activeGameControllers.get(docId);
  if (controller !== undefined) controller.playFromScene(sceneId);
  else pendingGameIntents.set(docId, { kind: "scene", sceneId });
}

/** Steps back one choice in `docId`'s open Game Script player; no-op when closed or at start. */
export function triggerGameBack(docId: string): void {
  activeGameControllers.get(docId)?.back();
}

/** Restarts `docId`'s open Game Script player; no-op when closed or at start. */
export function triggerGameRestart(docId: string): void {
  const controller = activeGameControllers.get(docId);
  if (controller === undefined) return;
  const snap = controller.snapshot();
  if (!snap.started || !hasRestartableProgress(snap)) return;
  controller.restart();
}

export function createGamePlayerController(options: {
  readonly docId: string;
  readonly store: InkPlaythroughStore;
  readonly now: () => number;
  readonly initialBlocks?: readonly BlockJSON[] | null;
}): GamePlayerController {
  const { docId, store, now } = options;
  const listeners = new Set<() => void>();
  let disposed = false;
  let blocks: readonly BlockJSON[] | null = options.initialBlocks ?? null;

  const saved = store.read(docId);
  const intent = pendingGameIntents.get(docId) ?? null;
  pendingGameIntents.delete(docId);

  let wantPlay = true;
  let snap: GamePlayerSnapshot = {
    loaded: blocks !== null,
    started: false,
    scenes: [],
    currentScene: null,
    startSceneId:
      intent?.kind === "scene" ? intent.sceneId : (saved?.startKnot ?? null),
    transcript: [],
    choices: [],
    flags: [],
    recordedChoices: intent?.kind === "scene" ? [] : (saved?.choices ?? []),
    editedFlags: intent?.kind === "scene" ? [] : (saved?.editedVariables ?? []),
    diverged: false,
    ended: false,
    focusNonce: 0,
  };

  const emit = (patch: Partial<GamePlayerSnapshot>): void => {
    if (disposed) return;
    snap = { ...snap, ...patch };
    for (const listener of listeners) listener();
  };

  const persist = (
    choices: readonly GameRecordedChoice[],
    editedFlags: readonly GameEditedFlag[],
    startSceneId: string | null,
  ): void => {
    if (
      choices.length === 0 &&
      editedFlags.length === 0 &&
      startSceneId === null
    ) {
      store.clear(docId);
    } else {
      store.write(docId, {
        choices: choices.map(({ index, text }) => ({ index, text })),
        editedVariables: editedFlags,
        startKnot: startSceneId,
        updatedAt: now(),
      });
    }
  };

  const replay = (params: {
    readonly choices: readonly GameRecordedChoice[];
    readonly editedFlags: readonly GameEditedFlag[];
    readonly startSceneId: string | null;
    readonly bumpFocus: boolean;
  }): void => {
    if (disposed || blocks === null) return;
    const outcome = replayGameScript(blocks, {
      choices: params.choices,
      editedFlags: params.editedFlags,
      startSceneId: params.startSceneId,
    });
    const resolvedStart =
      params.startSceneId !== null &&
      outcome.scenes.some((scene) => scene.id === params.startSceneId)
        ? params.startSceneId
        : null;
    persist(outcome.keptChoices, params.editedFlags, resolvedStart);
    emit({
      loaded: true,
      started: true,
      scenes: outcome.scenes,
      currentScene: outcome.currentScene,
      startSceneId: resolvedStart,
      transcript: outcome.transcript,
      choices: outcome.choices,
      flags: outcome.flags,
      recordedChoices: outcome.keptChoices,
      editedFlags: params.editedFlags,
      diverged: outcome.diverged,
      ended: outcome.ended,
      focusNonce: params.bumpFocus ? snap.focusNonce + 1 : snap.focusNonce,
    });
  };

  const controller: GamePlayerController = {
    snapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setBlocks(nextBlocks) {
      if (disposed) return;
      blocks = nextBlocks;
      if (wantPlay) {
        replay({
          choices: snap.recordedChoices,
          editedFlags: snap.editedFlags,
          startSceneId: snap.startSceneId,
          bumpFocus: !snap.started,
        });
      } else {
        emit({ loaded: true });
      }
    },
    play() {
      wantPlay = true;
      if (blocks !== null) {
        replay({
          choices: snap.recordedChoices,
          editedFlags: snap.editedFlags,
          startSceneId: snap.startSceneId,
          bumpFocus: true,
        });
      }
    },
    playFromScene(sceneId) {
      wantPlay = true;
      store.clear(docId);
      if (blocks === null) {
        emit({
          recordedChoices: [],
          editedFlags: [],
          startSceneId: sceneId,
          diverged: false,
        });
        return;
      }
      replay({
        choices: [],
        editedFlags: [],
        startSceneId: sceneId,
        bumpFocus: true,
      });
    },
    selectScene(sceneId) {
      wantPlay = true;
      if (blocks === null) {
        emit({ recordedChoices: [], startSceneId: sceneId, diverged: false });
        return;
      }
      replay({
        choices: [],
        editedFlags: snap.editedFlags,
        startSceneId: sceneId,
        bumpFocus: true,
      });
    },
    choose(choice) {
      if (!snap.started || blocks === null) return;
      const nextChoices: readonly GameRecordedChoice[] = [
        ...snap.recordedChoices,
        { index: choice.index, text: choice.text, blockId: choice.blockId },
      ];
      replay({
        choices: nextChoices,
        editedFlags: snap.editedFlags,
        startSceneId: snap.startSceneId,
        bumpFocus: true,
      });
    },
    editFlag(name, value) {
      if (blocks === null) return;
      const nextEdited: readonly GameEditedFlag[] = [
        ...snap.editedFlags.filter((entry) => entry.name !== name),
        { name, value },
      ];
      replay({
        choices: snap.recordedChoices,
        editedFlags: nextEdited,
        startSceneId: snap.startSceneId,
        bumpFocus: false,
      });
    },
    back() {
      if (!snap.started || blocks === null || snap.recordedChoices.length === 0)
        return;
      replay({
        choices: snap.recordedChoices.slice(0, -1),
        editedFlags: snap.editedFlags,
        startSceneId: snap.startSceneId,
        bumpFocus: true,
      });
    },
    restart() {
      wantPlay = true;
      store.clear(docId);
      if (blocks === null) {
        emit({
          recordedChoices: [],
          editedFlags: [],
          startSceneId: null,
          diverged: false,
        });
        return;
      }
      replay({
        choices: [],
        editedFlags: [],
        startSceneId: null,
        bumpFocus: true,
      });
    },
    dispose() {
      disposed = true;
      listeners.clear();
      if (activeGameControllers.get(docId) === controller) {
        activeGameControllers.delete(docId);
      }
    },
  };

  activeGameControllers.set(docId, controller);
  if (blocks !== null && wantPlay) {
    replay({
      choices: snap.recordedChoices,
      editedFlags: snap.editedFlags,
      startSceneId: snap.startSceneId,
      bumpFocus: true,
    });
  }
  return controller;
}
