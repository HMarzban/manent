// The web app's reader of pasted text: Fountain and Final Draft text as elements, loaded lazily on first rich paste.
import type { PastedTextPort } from "@manent/editor";
import type { readPastedText } from "@manent/formats";
import type { IdSource } from "@manent/schema";
import type { MessageQueue } from "@manent/ui";
import type { sayPastedAs } from "./pasted-message.ts";

/**
 * Loads @manent/formats lazily on the first external paste so opening an editor never eagerly pulls in the formats
 * bundle. When the first paste arrives before the chunk has loaded, `readAsync` finishes loading and converts it in a
 * second undo step; each conversion is said in a brief message whose action undoes it.
 */
export function createPastedText(options: {
  ids: IdSource;
  messages: MessageQueue;
}): PastedTextPort & {
  readAsync(
    text: string,
    elements: readonly string[],
    plainElement: string,
  ): Promise<ReturnType<PastedTextPort["read"]>>;
} {
  let loaded: { read: typeof readPastedText; say: typeof sayPastedAs } | null =
    null;
  let loading: Promise<void> | null = null;
  const loadOnce = (): Promise<void> => {
    if (loaded !== null) return Promise.resolve();
    if (loading !== null) return loading;
    loading = Promise.all([
      import("@manent/formats"),
      import("./pasted-message.ts"),
    ])
      .then(([formats, message]) => {
        loaded = { read: formats.readPastedText, say: message.sayPastedAs };
      })
      .catch(() => {
        loading = null;
      });
    return loading;
  };
  const parse = (
    text: string,
    elements: readonly string[],
    plainElement: string,
  ) =>
    loaded?.read(text, {
      ids: options.ids,
      elements,
      plainElement,
    })?.blocks ?? null;
  return {
    read(text, elements, plainElement) {
      if (loaded === null) {
        if (text.trim().length > 0) void loadOnce();
        return null;
      }
      return parse(text, elements, plainElement);
    },
    async readAsync(text, elements, plainElement) {
      if (text.trim().length === 0) return null;
      await loadOnce();
      return parse(text, elements, plainElement);
    },
    // only a paste that read returned blocks for is converted, so both have loaded by then
    converted(count) {
      loaded?.say(options.messages, count);
    },
  };
}
