// What the message slot says at each moment that tests trust, with the actions it offers.

import type { Message } from "../components/message-slot/message.ts";
import { DIALOG_WORDS } from "./dialog.ts";
import { EDITOR_WORDS } from "./editor.ts";
import { formatCount, joinNames } from "./format.ts";
import { receiptText } from "./receipt.ts";

/** Something that happened which the message slot reports. `before` is the day this device last synced the script, null when no day is known. */
export type TrustEvent =
  | { kind: "reconnected"; synced: number; overlaps: number; unplaced: number }
  | {
      kind: "offline_data_cleared";
      restored: number;
      lostTitles: readonly string[];
    }
  | { kind: "rebuilt"; reapplied: number }
  | { kind: "old_offline_work"; before: string | null }
  | { kind: "access_removed"; title: string; notSent: number }
  | {
      kind: "deleted_while_offline";
      title: string;
      byName: string;
      on: string;
      notSent: number;
    }
  | { kind: "changes_refused"; reapplied: number }
  | { kind: "crash_recovered"; count: number }
  | {
      kind: "setting_changed";
      byName: string | null;
      noun: string;
      valueLabel: string;
      pagesBefore: number | null;
      pagesAfter: number | null;
    }
  | { kind: "setting_refused"; noun: string }
  | { kind: "command_unavailable"; label: string; reason: string }
  | { kind: "preferences_reset"; count: number }
  | { kind: "past_comfort_limit"; title: string }
  | {
      kind: "review_settled";
      choice: "theirs" | "other" | "mine" | "merged" | "recovered";
      names: string | null;
      scene: string | null;
    };

type Words = Omit<Message, "id">;

const REVIEW = { label: "Review", commandId: "history.review" } as const;
const SEE_WHAT_CHANGED = {
  label: "See what changed",
  commandId: "history.seeWhatChanged",
} as const;
const OPEN_BESIDE = {
  label: "Open beside",
  commandId: "doc.openBeside",
} as const;
const OPEN_THEM = { label: "Open them", commandId: "doc.openLocal" } as const;
const EXPORT = { label: "Export", commandId: "doc.export" } as const;
const SCRIPT_SETTINGS = {
  label: "Script settings",
  commandId: "doc.scriptSettings",
} as const;
const UNDO_SETTING = { label: "Undo", commandId: "settings.undo" } as const;
const UNDO_EDIT = { label: "Undo", commandId: "edit.undo" } as const;
const UNDO_REVIEW = { label: "Undo", commandId: "review.undo" } as const;
const SPLIT_INTO_PARTS = {
  label: EDITOR_WORDS.splitIntoParts,
  commandId: "doc.splitIntoParts",
} as const;

// A message about the person's own work stays until dismissed; anything else leaves after its time.
const OWN_WORK = { lifetime: "until_dismissed", ownWork: true } as const;
const BRIEF = { lifetime: "brief", ownWork: false } as const;
const REVERSE = { lifetime: "reverse", ownWork: false } as const;

function settingChanged(
  event: Extract<TrustEvent, { kind: "setting_changed" }>,
): Words {
  const { byName, noun, valueLabel, pagesBefore, pagesAfter } = event;
  const pages =
    pagesBefore === null || pagesAfter === null
      ? ""
      : ` · ${formatCount(pagesBefore)} → ${formatCount(pagesAfter)} pages`;
  if (byName !== null)
    return {
      text: `${byName} changed ${noun} to ${valueLabel}${pages}.`,
      actions: [SCRIPT_SETTINGS],
      ...BRIEF,
    };
  const capitalised = noun.charAt(0).toUpperCase() + noun.slice(1);
  return {
    text: `${capitalised} is now ${valueLabel}${pages}.`,
    actions: [UNDO_SETTING],
    ...REVERSE,
  };
}

type ReviewSettled = Extract<TrustEvent, { kind: "review_settled" }>;

const USED_OTHER = "Used the other wording";
// what a review action did, before the scene it did it in; "theirs" without a name is the other wording
const REVIEW_SETTLED: Readonly<
  Record<ReviewSettled["choice"], (names: string | null) => string>
> = Object.freeze({
  theirs: (names) => (names === null ? USED_OTHER : `Used ${names}'s wording`),
  other: () => USED_OTHER,
  mine: () => "Used your wording",
  merged: () => "Kept the merged wording",
  recovered: () => "Put the recovered text back",
});

function reviewSettled(event: ReviewSettled): Words {
  const where = event.scene === null ? "" : ` in ${event.scene}`;
  return {
    text: `${REVIEW_SETTLED[event.choice](event.names)}${where}.`,
    actions: [event.choice === "merged" ? UNDO_REVIEW : UNDO_EDIT],
    ...REVERSE,
  };
}

function offlineDataCleared(
  restored: number,
  lostTitles: readonly string[],
): string {
  const back =
    restored === 1
      ? "1 synced script is back."
      : `${formatCount(restored)} synced scripts are back.`;
  if (lostTitles.length === 0)
    return `This browser cleared Manent's offline data. ${back}`;
  const quoted = lostTitles.map((title) => `'${title}'`);
  return `This browser cleared Manent's offline data. ${back} ${joinNames(quoted)} existed only here and cannot be recovered.`;
}

function wordsFor(event: TrustEvent): Words {
  switch (event.kind) {
    case "reconnected":
      return {
        text: receiptText(event),
        actions: event.overlaps + event.unplaced > 0 ? [REVIEW] : [],
        ...OWN_WORK,
      };
    case "offline_data_cleared":
      return {
        text: offlineDataCleared(event.restored, event.lostTitles),
        actions: [],
        ...OWN_WORK,
      };
    case "rebuilt":
      return event.reapplied === 0
        ? {
            text: "Manent reorganised how this script is stored. Undo history for this script starts again from now.",
            actions: [],
            ...BRIEF,
          }
        : {
            text: `Manent reorganised how this script is stored while you were away. Your ${formatCount(event.reapplied)} changes were re-applied. Undo history for this script starts again from now.`,
            actions: [SEE_WHAT_CHANGED],
            ...OWN_WORK,
          };
    case "old_offline_work":
      return {
        text:
          event.before === null
            ? "Your changes made offline could not be merged automatically. They are saved as 'Recovered — this device'."
            : `Your changes made offline since ${event.before} could not be merged automatically. They are saved as 'Recovered — this device, ${event.before}'.`,
        actions: [OPEN_BESIDE],
        ...OWN_WORK,
      };
    case "access_removed":
      return {
        text: `You no longer have access to '${event.title}'. Your ${formatCount(event.notSent)} changes that were not sent are kept on this device.`,
        actions: [OPEN_THEM, EXPORT],
        ...OWN_WORK,
      };
    case "deleted_while_offline":
      return {
        text: `'${event.title}' was deleted by ${event.byName} on ${event.on}. Your ${formatCount(event.notSent)} changes that were not sent are kept on this device.`,
        actions: [OPEN_THEM, EXPORT],
        ...OWN_WORK,
      };
    case "changes_refused":
      return event.reapplied === 0
        ? {
            text: "Manent could not accept this device's changes. They are saved as 'Recovered — this device'.",
            actions: [OPEN_BESIDE],
            ...OWN_WORK,
          }
        : {
            text: "Manent could not accept some changes from this device. They are saved as 'Recovered — this device' and the rest were re-applied.",
            actions: [SEE_WHAT_CHANGED],
            ...OWN_WORK,
          };
    case "crash_recovered":
      return {
        text: `Your last ${formatCount(event.count)} changes were already saved.`,
        actions: [],
        ...OWN_WORK,
      };
    case "setting_changed":
      return settingChanged(event);
    case "setting_refused":
      return {
        text: `Your change to ${event.noun} was made before page numbers were locked and was not applied.`,
        actions: [SCRIPT_SETTINGS],
        ...OWN_WORK,
      };
    case "command_unavailable":
      return {
        text: DIALOG_WORDS.disabledLine(event.label, event.reason),
        actions: [],
        ...BRIEF,
      };
    case "preferences_reset":
      return {
        text:
          event.count === 1
            ? "1 preference reset."
            : `${formatCount(event.count)} preferences reset.`,
        actions: [UNDO_SETTING],
        ...REVERSE,
      };
    case "past_comfort_limit":
      return {
        text: EDITOR_WORDS.pastComfortLimit(event.title),
        actions: [SPLIT_INTO_PARTS],
        lifetime: "until_dismissed",
        ownWork: false,
      };
    case "review_settled":
      return reviewSettled(event);
  }
}

/** The message for `event`. Its id is the event's kind; an action is drawn only once its command is registered. */
export function messageFor(event: TrustEvent): Message {
  return { id: event.kind, ...wordsFor(event) };
}
