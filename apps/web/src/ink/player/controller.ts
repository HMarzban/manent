// Ink player state machine: playthrough replay, live recompile handling, Back/Restart, variables, and visited lines.
import type {
  InkChoice,
  InkFault,
  InkVariable,
  InkVariableValue,
} from "@manent/formats";
import {
  inkCompileClient,
  setInkVisitedLines,
  subscribeInkCompile,
} from "../compile-client.ts";
import type {
  InkCompileClient,
  InkCompileSnapshot,
} from "../compile-client.ts";
import { advanceChoice, replayStory, safeWorkerCall } from "./replay.ts";
import type { InkPlace, TranscriptItem } from "./replay.ts";
import type {
  InkPlaythroughStore,
  RecordedChoice,
  RecordedVariable,
} from "./storage.ts";

export type { InkPlace, TranscriptItem };

export interface InkPlayerSnapshot {
  readonly compile: InkCompileSnapshot;
  readonly started: boolean;
  readonly busy: boolean;
  readonly transcript: readonly TranscriptItem[];
  readonly choices: readonly InkChoice[];
  readonly variables: readonly InkVariable[];
  readonly editedVariables: readonly RecordedVariable[];
  readonly recordedChoices: readonly RecordedChoice[];
  readonly startKnot: string | null;
  readonly place: InkPlace | null;
  readonly ended: boolean;
  readonly diverged: boolean;
  readonly fault: InkFault | null;
  readonly focusNonce: number;
}

export interface InkPlayerController {
  snapshot(): InkPlayerSnapshot;
  subscribe(listener: () => void): () => void;
  play(): void;
  playFromKnot(knot: string): void;
  choose(choice: InkChoice): void;
  editVariable(name: string, value: InkVariableValue): void;
  back(): void;
  restart(): void;
  dispose(): void;
}

type PendingIntent =
  { readonly kind: "play" } | { readonly kind: "knot"; readonly knot: string };

const EMPTY_COMPILE: InkCompileSnapshot = Object.freeze({
  state: "up_to_date",
  problems: [],
  lastGood: null,
  version: 0,
});

const EMPTY_VISITED: ReadonlySet<number> = new Set();

const activeControllers = new Map<string, InkPlayerController>();
const pendingIntents = new Map<string, PendingIntent>();

/** Queues or triggers `Play` for `docId`'s Ink player. */
export function triggerInkPlay(docId: string): void {
  const controller = activeControllers.get(docId);
  if (controller !== undefined) {
    controller.play();
    return;
  }
  pendingIntents.set(docId, { kind: "play" });
}

/** Queues or triggers `Play from here` starting at `knot` for `docId`'s Ink player. */
export function triggerInkPlayFromKnot(docId: string, knot: string): void {
  const controller = activeControllers.get(docId);
  if (controller !== undefined) {
    controller.playFromKnot(knot);
    return;
  }
  pendingIntents.set(docId, { kind: "knot", knot });
}

/** Steps back one choice in `docId`'s open Ink player; no-op when closed or at start. */
export function triggerInkBack(docId: string): void {
  activeControllers.get(docId)?.back();
}

/** Restarts `docId`'s open Ink player; no-op when closed or at start. */
export function triggerInkRestart(docId: string): void {
  const controller = activeControllers.get(docId);
  if (controller === undefined) return;
  const snap = controller.snapshot();
  if (
    !snap.started ||
    (snap.recordedChoices.length === 0 &&
      snap.editedVariables.length === 0 &&
      !snap.ended &&
      snap.fault === null &&
      snap.startKnot === null)
  )
    return;
  controller.restart();
}

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
  let visited = new Set<number>();

  const readCompile = (): InkCompileSnapshot =>
    inkCompileClient(docId)?.snapshot() ?? EMPTY_COMPILE;

  const saved = store.read(docId);
  const intent = pendingIntents.get(docId) ?? null;
  pendingIntents.delete(docId);

  let snap: InkPlayerSnapshot = {
    compile: readCompile(),
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

  const persist = (
    choices: readonly RecordedChoice[],
    editedVariables: readonly RecordedVariable[],
    startKnot: string | null,
  ): void => {
    if (
      choices.length === 0 &&
      editedVariables.length === 0 &&
      startKnot === null
    ) {
      store.clear(docId);
      return;
    }
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
    const outcome = await replayStory(client, { ...params, isStale });
    if (isStale() || outcome === null) return;
    visited = new Set(outcome.visited);
    publishVisited(visited);
    lastReplayedVersion = readCompile().version;
    persist(outcome.keptChoices, params.editedVariables, params.startKnot);
    emit({
      compile: readCompile(),
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
  };

  const syncWithCompile = (bumpFocus: boolean): void => {
    const compile = readCompile();
    emit({ compile });
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

  const stopCompile = subscribeInkCompile(docId, () => {
    syncWithCompile(!snap.started);
  });

  const controller: InkPlayerController = {
    snapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    play() {
      wantPlay = true;
      const client = inkCompileClient(docId);
      const compile = readCompile();
      if (client === null || compile.lastGood === null) return;
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
      if (client === null || readCompile().lastGood === null) return;
      void runReplay(client, {
        choices: [],
        editedVariables: [],
        startKnot: knot,
        bumpFocus: true,
      });
    },
    choose(choice) {
      const client = inkCompileClient(docId);
      if (client === null || !snap.started || snap.busy) return;
      const token = ++runSeq;
      const isStale = (): boolean => disposed || token !== runSeq;
      const nextRecorded = [
        ...snap.recordedChoices,
        { index: choice.index, text: choice.text },
      ];
      emit({ busy: true, diverged: false });
      void (async () => {
        const out = await advanceChoice(client, {
          choice,
          transcript: snap.transcript,
          visited,
          place: snap.place,
          isStale,
        });
        if (isStale() || out === null) return;
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
      })();
    },
    editVariable(name, value) {
      const client = inkCompileClient(docId);
      if (client === null || !snap.started) return;
      const nextEdited: RecordedVariable[] = [
        ...snap.editedVariables.filter((entry) => entry.name !== name),
        { name, value },
      ];
      const nextVars = snap.variables.map((entry) =>
        entry.name === name ? { name, value } : entry,
      );
      persist(snap.recordedChoices, nextEdited, snap.startKnot);
      emit({ variables: nextVars, editedVariables: nextEdited });
      void safeWorkerCall(() => client.setVariable(name, value), null);
    },
    back() {
      if (!snap.started || snap.recordedChoices.length === 0) return;
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
      if (client === null || readCompile().lastGood === null) {
        emit({
          started: false,
          transcript: [],
          choices: [],
          recordedChoices: [],
          editedVariables: [],
          startKnot: null,
          place: null,
          ended: false,
          diverged: false,
          fault: null,
        });
        return;
      }
      void runReplay(client, {
        choices: [],
        editedVariables: [],
        startKnot: null,
        bumpFocus: true,
      });
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
