// What a copy says in the message slot; light, as the Lock dialog and the handlers read it.
import { COPIES_WORDS } from "@manent/ui";
import type { Message } from "@manent/ui";

/** `title` is the copy's, which the Library refused. */
export function copyRefusedMessage(title: string): Message {
  return {
    id: "copy_refused",
    text: COPIES_WORDS.notSaved(title),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  };
}

/** `title` is the copy's; Open beside opens the last copy this tab made. */
export function copyLockedMessage(title: string): Message {
  return {
    id: "copy_locked",
    text: COPIES_WORDS.copyLocked(title),
    actions: [
      { label: COPIES_WORDS.openBeside, commandId: "copy.openCopyBeside" },
    ],
    lifetime: "reverse",
    ownWork: false,
  };
}
