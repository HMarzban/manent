// Reader-scoped Ink player controller: compiles a frozen sent draft in an isolated client and auto-plays it.
import type { InkChoice, InkVariableValue } from "@manent/formats";
import { createInkCompileClient } from "../ink/compile-client.ts";
import type {
  InkCompileClient,
  InkCompileSnapshot,
  InkRpcTransport,
} from "../ink/compile-client.ts";
import {
  EMPTY_COMPILE,
  RESET_PLAYER_PATCH,
  hasRestartableProgress,
} from "../ink/player/controller-registry.ts";
import type { InkPlayerSnapshot } from "../ink/player/controller-registry.ts";
import {
  advanceChoice,
  replayStory,
  safeWorkerCall,
} from "../ink/player/replay.ts";
import { createInkPlaythroughStore } from "../ink/player/storage.ts";
import type {
  InkPlaythroughStore,
  RecordedChoice,
  RecordedVariable,
} from "../ink/player/storage.ts";
import type { StorageEvents } from "../services/local-map.ts";

export { hasRestartableProgress };
export type { InkPlayerSnapshot };

export interface ReaderInkController {
  snapshot(): InkPlayerSnapshot;
  subscribe(listener: () => void): () => void;
  choose(choice: InkChoice): void;
  editVariable(name: string, value: InkVariableValue): void;
  back(): void;
  restart(): void;
  restartWorker(): void;
  dispose(): void;
}

export function createReaderInkController(options: {
  readonly playKey: string;
  readonly source: string;
  readonly storage: Storage | null;
  readonly storageEvents: StorageEvents;
  readonly userId: string | null;
  readonly now: () => number;
  readonly createTransport?: () => InkRpcTransport;
}): ReaderInkController {
  const { playKey, source, storage, storageEvents, userId, now } = options;
  const store: InkPlaythroughStore = createInkPlaythroughStore({
    storage,
    events: storageEvents,
    userId: userId ?? "anon",
    keyPrefix: "manent.reader.ink",
  });
  const client: InkCompileClient = createInkCompileClient({
    createTransport: options.createTransport,
  });

  const listeners = new Set<() => void>();
  let disposed = false;
  let runSeq = 0;
  let visited = new Set<number>();

  const saved = store.read(playKey);
  let snap: InkPlayerSnapshot = {
    compile: { ...EMPTY_COMPILE, state: "compiling" },
    workerStopped: false,
    started: false,
    busy: true,
    transcript: [],
    choices: [],
    variables: [],
    editedVariables: saved?.editedVariables ?? [],
    recordedChoices: saved?.choices ?? [],
    startKnot: null,
    place: null,
    ended: false,
    diverged: false,
    fault: null,
    focusNonce: 0,
  };

  const emit = (patch: Partial<InkPlayerSnapshot>): void => {
    if (disposed) return;
    snap = { ...snap, ...patch };
    for (const listener of listeners) listener();
  };

  const readCompile = (): InkCompileSnapshot => client.snapshot();

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
  ): void => {
    if (choices.length === 0 && editedVariables.length === 0)
      store.clear(playKey);
    else
      store.write(playKey, {
        choices,
        editedVariables,
        startKnot: null,
        updatedAt: now(),
      });
  };

  const runReplay = async (params: {
    readonly choices: readonly RecordedChoice[];
    readonly editedVariables: readonly RecordedVariable[];
    readonly bumpFocus: boolean;
  }): Promise<void> => {
    const token = ++runSeq;
    const isStale = (): boolean => disposed || token !== runSeq;
    emit({ busy: true });
    let completed = false;
    try {
      const outcome = await replayStory(client, {
        ...params,
        startKnot: null,
        isStale,
      });
      if (isStale() || outcome === null) return;
      completed = true;
      visited = new Set(outcome.visited);
      const compile = readCompile();
      persist(outcome.keptChoices, params.editedVariables);
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
        startKnot: null,
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

  const compileAndPlay = async (bumpFocus: boolean): Promise<void> => {
    const compiled = await client.compileNow(source);
    if (disposed) return;
    const compile = emitCompilePatch();
    if (
      compile.state === "stopped" ||
      !compiled.ok ||
      compile.lastGood === null
    ) {
      emit({ busy: false });
      return;
    }
    await runReplay({
      choices: snap.recordedChoices,
      editedVariables: snap.editedVariables,
      bumpFocus,
    });
  };

  void compileAndPlay(false);

  return {
    snapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    choose(choice) {
      if (!snap.started || snap.busy || snap.workerStopped) return;
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
          if (
            out.fault === null ||
            out.transcript.length > snap.transcript.length
          )
            persist(nextRecorded, snap.editedVariables);
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
      if (!snap.started || snap.workerStopped) return;
      const nextEdited: RecordedVariable[] = [
        ...snap.editedVariables.filter((entry) => entry.name !== name),
        { name, value },
      ];
      const nextVars = snap.variables.map((entry) =>
        entry.name === name ? { name, value } : entry,
      );
      persist(snap.recordedChoices, nextEdited);
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
      void runReplay({
        choices: snap.recordedChoices.slice(0, -1),
        editedVariables: snap.editedVariables,
        bumpFocus: true,
      });
    },
    restart() {
      store.clear(playKey);
      visited = new Set();
      const compile = readCompile();
      if (compile.state === "stopped" || compile.lastGood === null) {
        emitCompilePatch(RESET_PLAYER_PATCH);
        return;
      }
      void runReplay({ choices: [], editedVariables: [], bumpFocus: true });
    },
    restartWorker() {
      if (disposed) return;
      emit({ busy: true, fault: null });
      void (async () => {
        let handedOff = false;
        try {
          await client.restartWorker(source);
          if (disposed) return;
          const compile = emitCompilePatch();
          if (compile.state === "stopped" || compile.lastGood === null) return;
          handedOff = true;
          await runReplay({
            choices: snap.recordedChoices,
            editedVariables: snap.editedVariables,
            bumpFocus: true,
          });
        } catch {
          // Handled cleanly in finally.
        } finally {
          if (!disposed && !handedOff) emitCompilePatch({ busy: false });
        }
      })();
    },
    dispose() {
      disposed = true;
      runSeq++;
      listeners.clear();
      client.dispose();
      store.dispose();
    },
  };
}
