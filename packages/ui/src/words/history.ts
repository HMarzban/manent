// The words of version history: the versions list, Changes since, restoring, and who wrote what.

import type { Message } from "../components/message-slot/message.ts";
import {
  dayNumber,
  formatCount,
  formatDate,
  formatDay,
  formatPosition,
  formatTime,
} from "./format.ts";

/** The fields of the sync protocol's `VersionItem` a version's name is made from; this package does not import the protocol. */
interface VersionItem {
  kind: string;
  name: string | null;
  createdByUserId: string;
  createdAt: number;
  onDevice: boolean;
}

/** Something about history that the message slot reports; every field arrives as it is said ("'Table read draft'", "8", "14:32"). */
export type HistoryMessage =
  | { kind: "restored_you"; ref: string }
  | { kind: "restored_scene_you"; scene: string; ref: string }
  | { kind: "restored_by"; name: string; ref: string; time: string }
  | {
      kind: "restored_scene_by";
      name: string;
      scene: string;
      ref: string;
      time: string;
    }
  | { kind: "refused"; ref: string }
  | { kind: "saved_you" }
  | { kind: "named_by_other"; name: string; draft: string };

const SAVED_BY_YOU = "Saved by you";
const BEFORE_RESTORE = "Before restore";
const BEFORE_RECONNECT = "Before reconnect — this device";
const RECOVERED = "Recovered — this device";
const KEPT = "The script as it was is kept as 'Before restore'.";
const SERIES_LADDER = [
  "Writer's First",
  "Studio",
  "Network",
  "Table",
  "White",
] as const;

const quoted = (text: string): string => `'${text}'`;
const plural = (n: number, one: string, many: string): string =>
  n === 1 ? `1 ${one}` : `${formatCount(n)} ${many}`;

export const HISTORY_WORDS = {
  /** `keys` is the label of Name this draft's key ("⌘⇧S", "Ctrl+Shift+S"). */
  empty: (keys: string): string =>
    `Versions are kept as you write. Press ${keys} to name this one.`,
  problem: "Couldn't load older versions. Showing what is on this device.",
  /** `name` is "you" when the person made the last change; `when` its time ("14:10"). */
  working: (name: string, when: string): string => `Working — ${name}, ${when}`,
  /** The Working row while no source says who made the last change, or when. */
  workingLabel: "Working",
  /** The heading of the versions made on the local day of `at`. */
  dayGroup: (at: number, now: number): string => {
    const daysAgo = dayNumber(now) - dayNumber(at);
    if (daysAgo === 0) return "Today";
    if (daysAgo === 1) return "Yesterday";
    if (new Date(at).getFullYear() === new Date(now).getFullYear())
      return `${formatDay(at)} ${formatDate(at)}`;
    return `${formatDate(at)} ${new Date(at).getFullYear()}`;
  },
  summary: (changes: number, scenes: number): string =>
    scenes === 0
      ? plural(changes, "change", "changes")
      : `${plural(changes, "change", "changes")}, ${plural(scenes, "scene", "scenes")}`,
  namedBy: (name: string, time: string): string => `named by ${name} ${time}`,
  onDevice: "On this device",
  savedByYou: SAVED_BY_YOU,
  beforeRestore: BEFORE_RESTORE,
  beforeReconnect: BEFORE_RECONNECT,
  recovered: RECOVERED,
  changesSince: "Changes since",
  /** Changes since ▾ while it offers no baseline. */
  chooseBaseline: "Choose a version",
  show: "Show",
  /** In the order of the History store's modes: page, side, asterisks, as it was. */
  modes: ["On the page", "Side by side", "Asterisks only", "As it was"],
  compareNewer:
    "Changes are shown by text and element only: one of these was written by a newer Manent.",
  compareEngines:
    "Changes are shown by text and element only: these were laid out by different layout engines, so page breaks may differ.",
  filter: "Filter",
  allScenes: "All scenes",
  allPeople: "All people",
  previousChange: "Previous change",
  nextChange: "Next change",
  /** In place of the stepper when Working has no change since the baseline, `name` as Changes since ▾ shows it. */
  noChangesSince: (name: string): string => `No changes since ${name}.`,
  /** The accessible name of the stepper's position, which `formatPosition` writes. */
  stepName: (i: number, n: number): string => `Change ${formatPosition(i, n)}`,
  draftsOnly: "Drafts only",
  allVersions: "All",
  currentVersion: "Now",
  versionFilter: "Filter versions",
  backToScript: "‹ Back to script",
  backToRundown: "‹ Back to rundown",
  readOnlyReview: "Read-only",
  workingPreview: "Working — read-only",
  minimapLabel: "History outline",
  minimapHeading: "Outline",
  allItems: "All",
  changedOnly: "Changed",
  changedScenesCount: (changed: number, total: number): string =>
    `${formatCount(changed)} of ${formatCount(total)} changed`,
  sceneChangesLabel: (changes: number): string =>
    plural(changes, "change", "changes"),
  noChangedScenes: "No changed scenes.",
  noChangedRows: "No changed rows.",
  viewingVersion: (ref: string): string => `Viewing ${ref}`,
  showingChangesSince: (ref: string): string => `Showing changes since ${ref}`,
  /** `ref` is `versionRef`'s. */
  restoreTitle: (ref: string): string => `Restore ${ref}?`,
  restoreBody: "The script as it is now is kept as 'Before restore'.",
  restore: "Restore",
  restoreButton: (ref: string): string => `Restore ${ref}`,
  restoreSceneTitle: (scene: string, ref: string): string =>
    `Restore scene ${scene} from ${ref}?`,
  restoreSceneBody: (scene: string): string =>
    `Scene ${scene} as it is now is kept in 'Before restore'. The rest of the script is unchanged.`,
  restoreSceneButton: (scene: string): string => `Restore scene ${scene}`,
  restoredYou: (ref: string): string => `Restored ${ref}. ${KEPT}`,
  restoredSceneYou: (scene: string, ref: string): string =>
    `Restored scene ${scene} from ${ref}. ${KEPT}`,
  restoredBy: (name: string, ref: string, time: string): string =>
    `${name} restored ${ref} at ${time}. Your later changes are kept.`,
  restoredSceneBy: (
    name: string,
    scene: string,
    ref: string,
    time: string,
  ): string =>
    `${name} restored scene ${scene} from ${ref} at ${time}. Your later changes are kept.`,
  refused: (ref: string): string =>
    `Couldn't restore ${ref}: that version can no longer be restored. Open it with As it was and copy what you need.`,
  savedYou: "Saved by you.",
  namedByOther: (name: string, draft: string): string =>
    `${name} named a draft: '${draft}'.`,
  nameFailed: "Couldn't name this draft.",
  tryAgain: "Try again",
  /** `previous` is the earlier writer's line, null when none is known. */
  writtenBy: (name: string, when: string, previous: string | null): string =>
    previous === null
      ? `Written by ${name}, ${when}`
      : `Written by ${name}, ${when} · previously ${previous}`,
  /** For a writer known only by the version that holds the change. */
  writtenBefore: (name: string, when: string): string =>
    `Written by ${name}, before ${when}`,
  noAuthor:
    "No author recorded: this text came in with an import or before its history was kept.",
  nameField: "Name this draft",
  /** The names offered for a script's first ten drafts; `draftNumber` names the rest. */
  ordinals: [
    "First draft",
    "Second draft",
    "Third draft",
    "Fourth draft",
    "Fifth draft",
    "Sixth draft",
    "Seventh draft",
    "Eighth draft",
    "Ninth draft",
    "Tenth draft",
  ],
  draftNumber: (n: number): string => `Draft ${formatCount(n)}`,
  /** The draft ladder of the Drama, Single-camera, Multi-camera and Custom templates, in order. */
  seriesLadder: SERIES_LADDER,
  /** The draft ladder of the Animation template: the series ladder, then three more. */
  animationLadder: [...SERIES_LADDER, "Record", "Animatic", "Conformed"],
} as const;

/** A label that names a version by what made it, null for a version named by its time. */
function labelOf(item: VersionItem): string | null {
  if (item.kind === "pre_restore") return BEFORE_RESTORE;
  if (item.kind === "pre_merge" && item.onDevice) return BEFORE_RECONNECT;
  if (item.kind === "recovered") return RECOVERED;
  if (item.kind === "pre_hand_in") return "Before hand-in";
  if (item.kind === "prompter") return "Sent to prompter";
  return null;
}

const when = (at: number): string => `${formatDay(at)} ${formatTime(at)}`;

/** A version's row title: its name, its label, else its day and time ("Mon 14:10"). */
export function versionTitle(
  item: VersionItem,
  viewerUserId: string,
  _nameOf: (userId: string) => string,
): string {
  if (item.name !== null) return item.name;
  if (item.kind === "saved" && item.createdByUserId === viewerUserId)
    return SAVED_BY_YOU;
  return labelOf(item) ?? when(item.createdAt);
}

/** A version inside a sentence: its name or label in single quotes, else "the version from Mon 14:10". */
export function versionRef(
  item: VersionItem,
  _nameOf: (userId: string) => string,
): string {
  const label = item.name ?? labelOf(item);
  return label === null
    ? `the version from ${when(item.createdAt)}`
    : quoted(label);
}

type Words = Omit<Message, "id">;

const RESTORE_BEFORE = {
  label: HISTORY_WORDS.restoreButton(quoted(BEFORE_RESTORE)),
  commandId: "history.restoreBefore",
} as const;
const SEE_WHAT_CHANGED = {
  label: "See what changed",
  commandId: "history.seeWhatChanged",
} as const;
// A message about the person's own work stays until dismissed; anything else leaves after its time.
const OWN_WORK = { lifetime: "until_dismissed", ownWork: true } as const;
const BRIEF = { lifetime: "brief", ownWork: false } as const;
const REVERSE = { lifetime: "reverse", ownWork: false } as const;

function wordsFor(message: HistoryMessage): Words {
  switch (message.kind) {
    case "restored_you":
      return {
        text: HISTORY_WORDS.restoredYou(message.ref),
        actions: [RESTORE_BEFORE],
        ...REVERSE,
      };
    case "restored_scene_you":
      return {
        text: HISTORY_WORDS.restoredSceneYou(message.scene, message.ref),
        actions: [RESTORE_BEFORE],
        ...REVERSE,
      };
    case "restored_by":
      return {
        text: HISTORY_WORDS.restoredBy(message.name, message.ref, message.time),
        actions: [SEE_WHAT_CHANGED],
        ...OWN_WORK,
      };
    case "restored_scene_by":
      return {
        text: HISTORY_WORDS.restoredSceneBy(
          message.name,
          message.scene,
          message.ref,
          message.time,
        ),
        actions: [SEE_WHAT_CHANGED],
        ...OWN_WORK,
      };
    case "refused":
      return {
        text: HISTORY_WORDS.refused(message.ref),
        actions: [],
        lifetime: "until_dismissed",
        ownWork: false,
      };
    case "saved_you":
      return { text: HISTORY_WORDS.savedYou, actions: [], ...BRIEF };
    case "named_by_other":
      return {
        text: HISTORY_WORDS.namedByOther(message.name, message.draft),
        actions: [],
        ...BRIEF,
      };
  }
}

/** The message for `message`, under `id`. */
export function historyMessage(message: HistoryMessage, id: string): Message {
  return { id, ...wordsFor(message) };
}
