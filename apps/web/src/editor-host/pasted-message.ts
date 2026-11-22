// What a converted paste says. It loads with @manent/formats, since only a converted paste says it, and its
// words would push the editor's first load over its size budget.
import { IMPORT_WORDS } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";

/** Says in a brief message that a paste became `count` elements; the message's action undoes it. */
export function sayPastedAs(messages: MessageQueue, count: number): void {
  messages.push({
    id: "pasted_as",
    text: IMPORT_WORDS.pastedAs(count),
    actions: [{ label: "Undo", commandId: "edit.undo" }],
    lifetime: "brief",
    ownWork: false,
  });
}
