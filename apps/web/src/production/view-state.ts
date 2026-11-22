// What one person shows of a script's production on this device, and what they last issued it as: view state,
// never shared with anyone else on the script.
import { MARK_MODES } from "@manent/revisions";
import type { MarkMode } from "@manent/revisions";
import { ISSUE_FILES } from "@manent/sync-protocol";
import type { IssueFile } from "@manent/sync-protocol";
import { createLocalMap } from "../services/local-map.ts";
import type { StorageEvents } from "../services/local-map.ts";

/** The As and To of the person's last issue of the script. */
export interface IssueChoices {
  files: IssueFile[];
  tint: boolean;
  recipientUserIds: string[];
}

export interface ProductionViewState {
  mode(): MarkMode;
  setMode(mode: MarkMode): void;
  /** Colour revised pages. */
  tint(): boolean;
  setTint(on: boolean): void;
  /** Null before the person's first issue of the script on this device. */
  lastIssue(): IssueChoices | null;
  setLastIssue(choices: IssueChoices): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

const isMember =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): value is T =>
    list.some((member) => member === value);

const isMarkMode = isMember(MARK_MODES);
const isIssueFile = isMember(ISSUE_FILES);

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** Null for anything stored that does not read as a whole set of choices. */
function readChoices(value: unknown): IssueChoices | null {
  if (typeof value !== "object" || value === null) return null;
  const files: unknown = Reflect.get(value, "files");
  const tint: unknown = Reflect.get(value, "tint");
  const recipients: unknown = Reflect.get(value, "recipientUserIds");
  if (!Array.isArray(files) || !files.every(isIssueFile)) return null;
  if (typeof tint !== "boolean" || !isStrings(recipients)) return null;
  return { files, tint, recipientUserIds: recipients };
}

/** `docId`'s view state in `manent.view.production.<userId>`, shared by the person's tabs. */
export function createProductionViewState(options: {
  storage: Storage | null;
  events: StorageEvents;
  userId: string;
  docId: string;
}): ProductionViewState {
  const { docId } = options;
  const map = createLocalMap({
    storage: options.storage,
    key: `manent.view.production.${options.userId}`,
    events: options.events,
  });
  const keyOf = (name: string): string => `${docId}.${name}`;
  return {
    mode() {
      const mode = map.get(keyOf("mode"));
      return isMarkMode(mode) ? mode : "collated";
    },
    setMode: (mode) => map.set(keyOf("mode"), mode),
    tint: () => map.get(keyOf("tint")) === true,
    setTint: (on) => map.set(keyOf("tint"), on),
    lastIssue: () => readChoices(map.get(keyOf("lastIssue"))),
    setLastIssue: (choices) => map.set(keyOf("lastIssue"), choices),
    subscribe(listener) {
      return map.subscribe((keys) => {
        if (keys.some((key) => key.startsWith(`${docId}.`))) listener();
      });
    },
    dispose: () => map.dispose(),
  };
}
