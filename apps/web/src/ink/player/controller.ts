// Ink player state machine: playthrough replay, live recompile handling, Back/Restart, variables, and visited lines.
import {
  inkCompileClient,
  setInkVisitedLines,
  subscribeInkCompile,
} from "../compile-client.ts";
import type {
  InkCompileClient,
  InkCompileSnapshot,
} from "../compile-client.ts";
import {
  EMPTY_COMPILE,
  EMPTY_VISITED,
  RESET_PLAYER_PATCH,
  activeControllers,
  pendingIntents,
  triggerInkBack,
  triggerInkPlay,
  triggerInkPlayFromKnot,
  triggerInkRestart,
} from "./controller-registry.ts";
import type {
  InkPlayerController,
  InkPlayerSnapshot,
} from "./controller-registry.ts";
import { advanceChoice, replayStory, safeWorkerCall } from "./replay.ts";
import type { InkPlace, TranscriptItem } from "./replay.ts";
import type {
  InkPlaythroughStore,
  RecordedChoice,
  RecordedVariable,
} from "./storage.ts";

export {
  triggerInkBack,
  triggerInkPlay,
  triggerInkPlayFromKnot,
  triggerInkRestart,
};
export type {
  InkPlace,
  InkPlayerController,
  InkPlayerSnapshot,
  TranscriptItem,
};

export function createInkPlayerController(options: {
  readonly docId: string;
  readonly store: InkPlaythroughStore;
  readonly now: () => number;
}): InkPlayerController {
  const { docId, store, now } = options;
  const listeners = new Set<() => void>();
  let disposed = false;
  let runSeq = 0;
  let lastReplayedVersion = 0;
  let restartingWorker = false;
  let visited = new Set<number>();

  const readCompile = (): InkCompileSnapshot =>
    inkCompileClient(docId)?.snapshot() ?? EMPTY_COMPILE;
  const saved = store.read(docId);
  const intent = pendingIntents.get(docId) ?? null;
  pendingIntents.delete(docId);
  const initialCompile = readCompile();

  let snap: InkPlayerSnapshot = {
    compile: initialCompile,
    workerStopped: initialCompile.state === "stopped",
    started: false,
    busy: false,
    transcript: [],
    choices: [],
    variables: [],
    editedVariables:
      intent?.kind === "knot" ? [] : (saved?.editedVariables ?? []),
    recordedChoices: intent?.kind === "knot" ? [] : (saved?.choices ?? []),
    startKnot:
      intent?.kind === "knot" ? intent.knot : (saved?.startKnot ?? null),
    place: null,
    ended: false,
    diverged: false,
    fault: null,
    focusNonce: 0,
  };
  let wantPlay = intent !== null || saved !== null;

  const emit = (patch: Partial<InkPlayerSnapshot>): void => {
    if (disposed) return;
    snap = { ...snap, ...patch };
    for (const listener of listeners) listener();
  };
  const emitCompilePatch = (
    patch?: Partial<InkPlayerSnapshot>,
  ): InkCompileSnapshot => {
    const compile = readCompile();
    emit({ compile, workerStopped: compile.state === "stopped", ...patch });
    return compile;
  };
  const persist = (
    choices: readonly RecordedChoice[],
    editedVariables: readonly RecordedVariable[],
    startKnot: string | null,
  ): void => {
    if (
      choices.length === 0 &&
      editedVariables.length === 0 &&
      startKnot === null
    )
      store.clear(docId);
    else
      store.write(docId, {
        choices,
        editedVariables,
        startKnot,
        updatedAt: now(),
      });
  };
  const publishVisited = (lines: ReadonlySet<number>): void => {
    if (!disposed) setInkVisitedLines(docId, lines);
  };

  const runReplay = async (
    client: InkCompileClient,
    params: {
      readonly choices: readonly RecordedChoice[];
      readonly editedVariables: readonly RecordedVariable[];
      readonly startKnot: string | null;
      readonly bumpFocus: boolean;
    },
  ): Promise<void> => {
    const token = ++runSeq;
    const isStale = (): boolean => disposed || token !== runSeq;
    emit({ busy: true });
    let completed = false;
    try {
      const outcome = await replayStory(client, { ...params, isStale });
      if (isStale() || outcome === null) return;
      completed = true;
      visited = new Set(outcome.visited);
      publishVisited(visited);
      const compile = readCompile();
      lastReplayedVersion = compile.version;
      persist(outcome.keptChoices, params.editedVariables, params.startKnot);
      emit({
        compile,
        workerStopped: compile.state === "stopped",
        started: true,
        busy: false,
        transcript: outcome.transcript,
        choices: outcome.choices,
        variables: outcome.variables,
        recordedChoices: outcome.keptChoices,
        editedVariables: params.editedVariables,
        startKnot: params.startKnot,
        place: outcome.place,
        ended: outcome.ended,
        diverged: outcome.diverged,
        fault: outcome.fault,
        focusNonce: params.bumpFocus ? snap.focusNonce + 1 : snap.focusNonce,
      });
    } finally {
      if (!completed && !isStale()) emitCompilePatch({ busy: false });
    }
  };

  const syncWithCompile = (bumpFocus: boolean): void => {
    const compile = emitCompilePatch();
    if (compile.state === "stopped" || restartingWorker) return;
    if (!wantPlay || compile.lastGood === null || compile.version === 0) return;
    if (snap.started && compile.version === lastReplayedVersion) return;
    const client = inkCompileClient(docId);
    if (client === null) return;
    void runReplay(client, {
      choices: snap.recordedChoices,
      editedVariables: snap.editedVariables,
      startKnot: snap.startKnot,
      bumpFocus,
    });
  };
  const stopCompile = subscribeInkCompile(docId, () =>
    syncWithCompile(!snap.started),
  );

  const controller: InkPlayerController = {
    snapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    play() {
      wantPlay = true;
      const client = inkCompileClient(docId);
      const compile = readCompile();
      if (
        client === null ||
        compile.state === "stopped" ||
        compile.lastGood === null
      )
        return;
      if (!snap.started || compile.version !== lastReplayedVersion) {
        void runReplay(client, {
          choices: snap.recordedChoices,
          editedVariables: snap.editedVariables,
          startKnot: snap.startKnot,
          bumpFocus: true,
        });
      }
    },
    playFromKnot(knot) {
      wantPlay = true;
      store.clear(docId);
      emit({
        recordedChoices: [],
        editedVariables: [],
        startKnot: knot,
        diverged: false,
        fault: null,
      });
      const client = inkCompileClient(docId);
      const compile = readCompile();
      if (
        client === null ||
        compile.state === "stopped" ||
        compile.lastGood === null
      )
        return;
      void runReplay(client, {
        choices: [],
        editedVariables: [],
        startKnot: knot,
        bumpFocus: true,
      });
    },
    choose(choice) {
      const client = inkCompileClient(docId);
      if (client === null || !snap.started || snap.busy || snap.workerStopped)
        return;
      const token = ++runSeq;
      const isStale = (): boolean => disposed || token !== runSeq;
      const nextRecorded = [
        ...snap.recordedChoices,
        { index: choice.index, text: choice.text },
      ];
      emit({ busy: true, diverged: false });
      void (async () => {
        let completed = false;
        try {
          const out = await advanceChoice(client, {
            choice,
            transcript: snap.transcript,
            visited,
            place: snap.place,
            isStale,
          });
          if (isStale() || out === null) return;
          completed = true;
          visited = new Set(out.visited);
          publishVisited(visited);
          if (
            out.fault === null ||
            out.transcript.length > snap.transcript.length
          )
            persist(nextRecorded, snap.editedVariables, snap.startKnot);
          emit({
            busy: false,
            transcript: out.transcript,
            choices: out.choices,
            variables:
              out.variables.length > 0 || out.fault === null
                ? out.variables
                : snap.variables,
            recordedChoices:
              out.transcript.length > snap.transcript.length
                ? nextRecorded
                : snap.recordedChoices,
            place: out.place,
            ended: out.ended,
            diverged: false,
            fault: out.fault,
            focusNonce: snap.focusNonce + 1,
          });
        } finally {
          if (!completed && !isStale()) emitCompilePatch({ busy: false });
        }
      })();
    },
    editVariable(name, value) {
      const client = inkCompileClient(docId);
      if (client === null || !snap.started || snap.workerStopped) return;
      const nextEdited: RecordedVariable[] = [
        ...snap.editedVariables.filter((entry) => entry.name !== name),
        { name, value },
      ];
      const nextVars = snap.variables.map((entry) =>
        entry.name === name ? { name, value } : entry,
      );
      persist(snap.recordedChoices, nextEdited, snap.startKnot);
      emit({ variables: nextVars, editedVariables: nextEdited });
      void (async () => {
        try {
          await safeWorkerCall(() => client.setVariable(name, value), null);
        } finally {
          if (!disposed && readCompile().state === "stopped")
            emitCompilePatch({ busy: false });
        }
      })();
    },
    back() {
      if (
        !snap.started ||
        snap.busy ||
        snap.workerStopped ||
        snap.recordedChoices.length === 0
      )
        return;
      const client = inkCompileClient(docId);
      if (client === null) return;
      void runReplay(client, {
        choices: snap.recordedChoices.slice(0, -1),
        editedVariables: snap.editedVariables,
        startKnot: snap.startKnot,
        bumpFocus: true,
      });
    },
    restart() {
      wantPlay = true;
      store.clear(docId);
      visited = new Set();
      publishVisited(EMPTY_VISITED);
      const client = inkCompileClient(docId);
      const compile = readCompile();
      if (
        client === null ||
        compile.state === "stopped" ||
        compile.lastGood === null
      ) {
        emitCompilePatch(RESET_PLAYER_PATCH);
        return;
      }
      void runReplay(client, {
        choices: [],
        editedVariables: [],
        startKnot: null,
        bumpFocus: true,
      });
    },
    restartWorker() {
      const client = inkCompileClient(docId);
      if (client === null || disposed) return;
      wantPlay = true;
      restartingWorker = true;
      emit({ busy: true, fault: null });
      void (async () => {
        let handedOff = false;
        try {
          await client.restartWorker();
          if (disposed) return;
          const compile = emitCompilePatch();
          if (compile.state === "stopped" || compile.lastGood === null) return;
          restartingWorker = false;
          handedOff = true;
          await runReplay(client, {
            choices: snap.recordedChoices,
            editedVariables: snap.editedVariables,
            startKnot: snap.startKnot,
            bumpFocus: true,
          });
        } catch {
          // Handled cleanly in finally.
        } finally {
          restartingWorker = false;
          if (!disposed && !handedOff) emitCompilePatch({ busy: false });
        }
      })();
    },
    dispose() {
      disposed = true;
      runSeq++;
      stopCompile();
      listeners.clear();
      if (activeControllers.get(docId) === controller)
        activeControllers.delete(docId);
    },
  };

  activeControllers.set(docId, controller);
  if (wantPlay) syncWithCompile(true);
  return controller;
}
