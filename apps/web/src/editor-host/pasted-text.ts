// The web app's reader of pasted text: Fountain and Final Draft text as elements, once @manent/formats has loaded.
import type { PastedTextPort } from "@manent/editor";
import type { readPastedText } from "@manent/formats";
import type { IdSource } from "@manent/schema";
import type { MessageQueue } from "@manent/ui";
import type { sayPastedAs } from "./pasted-message.ts";

/**
 * Starts loading @manent/formats; until it has loaded every paste stays plain text. Each conversion is said in a
 * brief message whose action undoes it.
 */
export function createPastedText(options: {
  ids: IdSource;
  messages: MessageQueue;
}): PastedTextPort {
  let loaded: { read: typeof readPastedText; say: typeof sayPastedAs } | null =
    null;
  void Promise.all([
    import("@manent/formats"),
    import("./pasted-message.ts"),
  ]).then(([formats, message]) => {
    loaded = { read: formats.readPastedText, say: message.sayPastedAs };
  });
  return {
    read(text, elements, plainElement) {
      if (loaded === null) return null;
      const pasted = loaded.read(text, {
        ids: options.ids,
        elements,
        plainElement,
      });
      return pasted?.blocks ?? null;
    },
    // only a paste that read returned blocks for is converted, so both have loaded by then
    converted(count) {
      loaded?.say(options.messages, count);
    },
  };
}
