// Per-device Ink playthrough persistence under localStorage["manent.ink.<userId>"], capped at 200 entries.
import type { InkVariableValue } from "@manent/formats";
import { createLocalMap } from "../../services/local-map.ts";
import type { StorageEvents } from "../../services/local-map.ts";

export interface RecordedChoice {
  readonly index: number;
  readonly text: string;
}

export interface RecordedVariable {
  readonly name: string;
  readonly value: InkVariableValue;
}

export interface StoredPlaythrough {
  readonly choices: readonly RecordedChoice[];
  readonly editedVariables: readonly RecordedVariable[];
  readonly startKnot: string | null;
  readonly updatedAt: number;
}

const MAX_PLAYTHROUGHS = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVariableValue(value: unknown): value is InkVariableValue {
  return (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  );
}

function isRecordedChoice(value: unknown): value is RecordedChoice {
  return (
    isRecord(value) &&
    typeof value.index === "number" &&
    Number.isInteger(value.index) &&
    value.index >= 0 &&
    typeof value.text === "string"
  );
}

function isRecordedVariable(value: unknown): value is RecordedVariable {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isVariableValue(value.value)
  );
}

function parsePlaythrough(raw: unknown): StoredPlaythrough | null {
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw.choices) || !raw.choices.every(isRecordedChoice))
    return null;
  if (
    !Array.isArray(raw.editedVariables) ||
    !raw.editedVariables.every(isRecordedVariable)
  )
    return null;
  if (raw.startKnot !== null && typeof raw.startKnot !== "string") return null;
  if (typeof raw.updatedAt !== "number" || !Number.isFinite(raw.updatedAt))
    return null;
  return {
    choices: raw.choices,
    editedVariables: raw.editedVariables,
    startKnot: raw.startKnot,
    updatedAt: raw.updatedAt,
  };
}

export interface InkPlaythroughStore {
  read(docId: string): StoredPlaythrough | null;
  write(docId: string, entry: StoredPlaythrough): void;
  clear(docId: string): void;
  dispose(): void;
}

/** Creates a local-only Ink playthrough store backed by `localStorage["manent.ink.<userId>"]`. */
export function createInkPlaythroughStore(options: {
  readonly storage: Storage | null;
  readonly events: StorageEvents;
  readonly userId: string;
}): InkPlaythroughStore {
  const map = createLocalMap({
    storage: options.storage,
    key: `manent.ink.${options.userId}`,
    events: options.events,
  });

  const pruneIfFull = (incomingDocId: string): void => {
    const keys = map.keys();
    if (keys.length < MAX_PLAYTHROUGHS || map.get(incomingDocId) !== undefined)
      return;
    const dated = keys
      .map((id) => ({
        id,
        updatedAt: parsePlaythrough(map.get(id))?.updatedAt ?? 0,
      }))
      .toSorted(
        (a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id),
      );
    const excess = keys.length - MAX_PLAYTHROUGHS + 1;
    for (let i = 0; i < excess; i++) {
      const oldest = dated[i];
      if (oldest !== undefined) map.remove(oldest.id);
    }
  };

  return {
    read: (docId) => parsePlaythrough(map.get(docId)),
    write(docId, entry) {
      pruneIfFull(docId);
      map.set(docId, entry);
    },
    clear(docId) {
      map.remove(docId);
    },
    dispose: () => map.dispose(),
  };
}
