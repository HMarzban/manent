import type { RowExtension } from "../history/row-extensions.ts";

export const sendDraftHistoryRow: RowExtension = {
  line: () => null,
  menu: () => [],
};
