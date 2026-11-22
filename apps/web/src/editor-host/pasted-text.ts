// The web app's reader of pasted text: Fountain and Final Draft text as elements, once @manent/formats has loaded.
import type { PastedTextPort } from "@manent/editor";
import type { readPastedText } from "@manent/formats";
import type { IdSource } from "@manent/schema";
import { IMPORT_WORDS } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";

/**
 * Starts loading @manent/formats; until it has loaded every paste stays plain text. Each conversion is said in a
 * brief message whose action undoes it.
 */
export function createPastedText(options: {
  ids: IdSource;
  messages: MessageQueue;
}): PastedTextPort {
  let reader: typeof readPastedText | null = null;
  void import("@manent/formats").then((formats) => {
    reader = formats.readPastedText;
  });
  return {
    read(text, elements, plainElement) {
      if (reader === null) return null;
      const pasted = reader(text, { ids: options.ids, elements, plainElement });
      return pasted?.blocks ?? null;
    },
    converted(count) {
      options.messages.push({
        id: "pasted_as",
        text: IMPORT_WORDS.pastedAs(count),
        actions: [{ label: "Undo", commandId: "edit.undo" }],
        lifetime: "brief",
        ownWork: true,
      });
    },
  };
}
