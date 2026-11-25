// Pure playthrough replay against an InkCompileClient: restarts, jumps to start knot, re-applies edited variables, and replays choices by text.
import type { InkChoice, InkFault, InkVariable } from "@manent/formats";
import type { InkCompileClient } from "../compile-client.ts";
import type { RecordedChoice, RecordedVariable } from "./storage.ts";

export type TranscriptItem =
  | {
      readonly kind: "passage";
      readonly text: string;
      readonly line: number | null;
      readonly knot: string | null;
      readonly stitch: string | null;
    }
  | { readonly kind: "choice"; readonly text: string };

export interface InkPlace {
  readonly knot: string;
  readonly stitch: string | null;
}

export interface ReplayOutcome {
  readonly transcript: readonly TranscriptItem[];
  readonly choices: readonly InkChoice[];
  readonly variables: readonly InkVariable[];
  readonly keptChoices: readonly RecordedChoice[];
  readonly visited: ReadonlySet<number>;
  readonly place: InkPlace | null;
  readonly ended: boolean;
  readonly diverged: boolean;
  readonly fault: InkFault | null;
}

/** Wraps a worker RPC promise so worker disposal or termination returns `fallback` without unhandled rejection. */
export async function safeWorkerCall<T>(
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Replays `choices` and `editedVariables` from `startKnot` (or start of story) on `client`.
 * Returns null if `isStale()` turns true or the worker closes mid-replay.
 */
export async function replayStory(
  client: InkCompileClient,
  params: {
    readonly choices: readonly RecordedChoice[];
    readonly editedVariables: readonly RecordedVariable[];
    readonly startKnot: string | null;
    readonly isStale: () => boolean;
  },
): Promise<ReplayOutcome | null> {
  const { choices, editedVariables, startKnot, isStale } = params;
  const reset = await safeWorkerCall(() => client.restart(), null);
  if (isStale() || reset === null) return null;
  if (!reset.ok) {
    return {
      transcript: [],
      choices: [],
      variables: [],
      keptChoices: choices,
      visited: new Set(),
      place: null,
      ended: true,
      diverged: false,
      fault: { line: reset.line, message: reset.message },
    };
  }

  if (startKnot !== null) {
    const jumped = await safeWorkerCall(() => client.goTo(startKnot), null);
    if (isStale() || jumped === null) return null;
    if (!jumped.ok) {
      return {
        transcript: [],
        choices: [],
        variables: [],
        keptChoices: [],
        visited: new Set(),
        place: null,
        ended: true,
        diverged: false,
        fault: { line: jumped.line, message: jumped.message },
      };
    }
  }

  for (const entry of editedVariables) {
    await safeWorkerCall(
      () => client.setVariable(entry.name, entry.value),
      null,
    );
    if (isStale()) return null;
  }

  const transcript: TranscriptItem[] = [];
  const visited = new Set<number>();
  let place: InkPlace | null =
    startKnot === null ? null : { knot: startKnot, stitch: null };

  const firstStep = await safeWorkerCall(() => client.proceed(), null);
  if (isStale() || firstStep === null) return null;
  if (!firstStep.result.ok) {
    return {
      transcript,
      choices: [],
      variables: firstStep.variables,
      keptChoices: [],
      visited,
      place,
      ended: true,
      diverged: false,
      fault: { line: firstStep.result.line, message: firstStep.result.message },
    };
  }

  for (const passage of firstStep.result.passages) {
    transcript.push({ kind: "passage", ...passage });
    if (passage.line !== null) visited.add(passage.line);
    if (passage.knot !== null)
      place = { knot: passage.knot, stitch: passage.stitch };
  }

  let currentChoices = firstStep.choices;
  let currentVars = firstStep.variables;
  let ended = firstStep.ended;
  let fault = firstStep.fault;
  let diverged = false;
  let keptChoices = choices;

  for (let i = 0; i < choices.length; i++) {
    const rec = choices[i]!;
    const match = currentChoices.find((choice) => choice.text === rec.text);
    if (match === undefined) {
      diverged = true;
      keptChoices = choices.slice(0, i);
      break;
    }
    transcript.push({ kind: "choice", text: rec.text });
    const chosen = await safeWorkerCall(() => client.choose(match.index), null);
    if (isStale() || chosen === null) return null;
    if (!chosen.ok) {
      fault = { line: chosen.line, message: chosen.message };
      ended = true;
      break;
    }
    const step = await safeWorkerCall(() => client.proceed(), null);
    if (isStale() || step === null) return null;
    currentChoices = step.choices;
    currentVars = step.variables;
    ended = step.ended;
    fault = step.fault;
    if (!step.result.ok) {
      fault = { line: step.result.line, message: step.result.message };
      ended = true;
      break;
    }
    for (const passage of step.result.passages) {
      transcript.push({ kind: "passage", ...passage });
      if (passage.line !== null) visited.add(passage.line);
      if (passage.knot !== null)
        place = { knot: passage.knot, stitch: passage.stitch };
    }
  }

  return {
    transcript,
    choices: currentChoices,
    variables: currentVars,
    keptChoices,
    visited,
    place,
    ended,
    diverged,
    fault,
  };
}

export interface AdvanceOutcome {
  readonly transcript: readonly TranscriptItem[];
  readonly choices: readonly InkChoice[];
  readonly variables: readonly InkVariable[];
  readonly visited: ReadonlySet<number>;
  readonly place: InkPlace | null;
  readonly ended: boolean;
  readonly fault: InkFault | null;
}

/** Chooses `choice` on `client` and advances until the next choice list, end, or runtime fault. */
export async function advanceChoice(
  client: InkCompileClient,
  params: {
    readonly choice: InkChoice;
    readonly transcript: readonly TranscriptItem[];
    readonly visited: ReadonlySet<number>;
    readonly place: InkPlace | null;
    readonly isStale: () => boolean;
  },
): Promise<AdvanceOutcome | null> {
  const { choice, isStale } = params;
  const chosen = await safeWorkerCall(() => client.choose(choice.index), null);
  if (isStale() || chosen === null) return null;
  if (!chosen.ok) {
    return {
      transcript: params.transcript,
      choices: [],
      variables: [],
      visited: params.visited,
      place: params.place,
      ended: true,
      fault: { line: chosen.line, message: chosen.message },
    };
  }
  const step = await safeWorkerCall(() => client.proceed(), null);
  if (isStale() || step === null) return null;
  const nextTranscript: TranscriptItem[] = [
    ...params.transcript,
    { kind: "choice", text: choice.text },
  ];
  const nextVisited = new Set(params.visited);
  let place = params.place;
  if (step.result.ok) {
    for (const passage of step.result.passages) {
      nextTranscript.push({ kind: "passage", ...passage });
      if (passage.line !== null) nextVisited.add(passage.line);
      if (passage.knot !== null)
        place = { knot: passage.knot, stitch: passage.stitch };
    }
  }
  return {
    transcript: nextTranscript,
    choices: step.choices,
    variables: step.variables,
    visited: nextVisited,
    place,
    ended: step.ended,
    fault: step.result.ok
      ? step.fault
      : { line: step.result.line, message: step.result.message },
  };
}
