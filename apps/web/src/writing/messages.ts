// What the Writing switch says in the message slot.
import { WRITING_WORDS } from "@manent/ui";
import type { Message } from "@manent/ui";

/** Said until dismissed: a lock moved the person off As suggestions without their asking. */
export const LOCKED_BACK: Message = Object.freeze({
  id: "writing.locked_back",
  text: WRITING_WORDS.lockedBack,
  actions: [],
  lifetime: "until_dismissed",
  ownWork: true,
});
