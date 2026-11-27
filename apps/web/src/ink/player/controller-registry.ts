// Shared types, constants, and document-scoped controller triggers for the Ink player.
import type {
  InkChoice,
  InkFault,
  InkVariable,
  InkVariableValue,
} from "@manent/formats";
import type { InkCompileSnapshot } from "../compile-client.ts";
import type { InkPlace, TranscriptItem } from "./replay.ts";
import type { RecordedChoice, RecordedVariable } from "./storage.ts";

export interface InkPlayerSnapshot {
  readonly compile: InkCompileSnapshot;
  readonly workerStopped: boolean;
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
  restartWorker(): void;
  dispose(): void;
}

export type PendingIntent =
  { readonly kind: "play" } | { readonly kind: "knot"; readonly knot: string };

export const EMPTY_COMPILE: InkCompileSnapshot = Object.freeze({
  state: "up_to_date",
  problems: [],
  lastGood: null,
  version: 0,
});
export const EMPTY_VISITED: ReadonlySet<number> = new Set();
export const RESET_PLAYER_PATCH: Partial<InkPlayerSnapshot> = Object.freeze({
  started: false,
  busy: false,
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
export const activeControllers = new Map<string, InkPlayerController>();
export const pendingIntents = new Map<string, PendingIntent>();

export function hasRestartableProgress(snap: InkPlayerSnapshot): boolean {
  return (
    snap.recordedChoices.length > 0 ||
    snap.editedVariables.length > 0 ||
    snap.ended ||
    snap.fault !== null ||
    snap.startKnot !== null
  );
}

/** Queues or triggers `Play` for `docId`'s Ink player. */
export function triggerInkPlay(docId: string): void {
  const controller = activeControllers.get(docId);
  if (controller !== undefined) controller.play();
  else pendingIntents.set(docId, { kind: "play" });
}

/** Queues or triggers `Play from here` starting at `knot` for `docId`'s Ink player. */
export function triggerInkPlayFromKnot(docId: string, knot: string): void {
  const controller = activeControllers.get(docId);
  if (controller !== undefined) controller.playFromKnot(knot);
  else pendingIntents.set(docId, { kind: "knot", knot });
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
  if (!snap.started || !hasRestartableProgress(snap)) return;
  controller.restart();
}
