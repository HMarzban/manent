// What Duplicate adds to a version's row in History.
import type { RowExtension } from "../history/row-extensions.ts";

export const copiesHistoryRow: RowExtension = {
  line: () => null,
  menu: () => ["doc.duplicateVersion"],
};
