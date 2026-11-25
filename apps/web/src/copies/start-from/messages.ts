// What Start a … from this… says in the message slot, after starting or on refusal.
import { COPIES_WORDS } from "@manent/ui";
import type { Message, StartFromTarget } from "@manent/ui";

/** Brief confirmation after starting a film or stage play from a book. */
export function startedFromBookMessage(
  target: StartFromTarget,
  sourceTitle: string,
  chapters: number,
): Message {
  return {
    id: "start_from_book",
    text: COPIES_WORDS.startedFromBook(target, sourceTitle, chapters),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  };
}

/** Brief confirmation after starting a film, episode or stage play from another script. */
export function startedFromScriptMessage(
  target: StartFromTarget,
  sourceTitle: string,
): Message {
  return {
    id: "start_from_script",
    text: COPIES_WORDS.startedFromScript(target, sourceTitle),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  };
}

/** Brief refusal when starting from `sourceTitle` could not read the source or save the new project. */
export function startFromRefusedMessage(
  target: StartFromTarget,
  sourceTitle: string,
): Message {
  return {
    id: "start_from_refused",
    text: COPIES_WORDS.startFromRefused(target, sourceTitle),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  };
}
