// The title page as the editor reads and writes it: the script's titlePage map, each write typing that undo tracks.
import { ORIGIN_TITLE_PAGE, titlePage } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { TitlePageSource } from "@manent/editor";
import { EDITOR_WORDS } from "@manent/ui";

export function titlePageSource(doc: CrdtDoc): TitlePageSource {
  const fields = titlePage(doc);
  return {
    port: {
      get: () => fields.fields(),
      set: (field, value) => fields.set(field, value, ORIGIN_TITLE_PAGE),
      subscribe: (listener) => fields.subscribe(() => listener()),
    },
    words: EDITOR_WORDS.titlePage,
  };
}
