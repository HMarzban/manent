// What the Writing switch says in the message slot.
import { WRITING_WORDS } from "@manent/ui";
import type { Message } from "@manent/ui";

const RESTORE = Object.freeze({
  label: WRITING_WORDS.restoreBeforeHandIn,
  commandId: "writing.restoreBeforeHandIn",
});
const REVIEW = Object.freeze({
  label: WRITING_WORDS.review,
  commandId: "history.review",
});

/** Said until dismissed: a lock moved the person off As suggestions without their asking. */
export const LOCKED_BACK: Message = Object.freeze({
  id: "writing.locked_back",
  text: WRITING_WORDS.lockedBack,
  actions: [],
  lifetime: "until_dismissed",
  ownWork: true,
});

export function leftPrivatelyMessage(scenes: number): Message {
  return {
    id: "writing.left_privately",
    text: WRITING_WORDS.leftPrivately(scenes),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  };
}

/** To the writer, offering the hand-in's reverse, and To review when it listed passages there. */
export function handedInMessage(scenes: number, overlaps: number): Message {
  return {
    id: "writing.handed_in",
    text: WRITING_WORDS.handedIn(scenes, overlaps),
    actions: overlaps === 0 ? [RESTORE] : [REVIEW, RESTORE],
    lifetime: "reverse",
    ownWork: false,
  };
}

/** To everyone else in the script. */
export function handedInByMessage(name: string, scenes: number): Message {
  return {
    id: "writing.handed_in_by",
    text: WRITING_WORDS.handedInBy(name, scenes),
    actions: [
      {
        label: WRITING_WORDS.seeWhatChanged,
        commandId: "writing.seeHandedIn",
      },
    ],
    lifetime: "brief",
    ownWork: false,
  };
}
