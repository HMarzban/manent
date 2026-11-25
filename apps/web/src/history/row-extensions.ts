// What another feature adds to a version's row.
import type { CommandId } from "@manent/commands";
import type { VersionItem } from "@manent/sync-protocol";
import { productionHistoryRow } from "../production/history-row.ts";
import { sendDraftHistoryRow } from "../send-draft/history-row.ts";
import { copiesHistoryRow } from "../copies/history-row.ts";
import { linksHistoryRow } from "../links/history-row.ts";

export interface RowLine {
  readonly text: string;
  readonly tooltip: string | null;
}

export interface RowExtension {
  /** Optional list-level hook called once per History list mount. */
  useList?(docId: string): void;
  /** Optional row-level hook called unconditionally per version row; falls back to `line`. */
  useLine?(docId: string, item: VersionItem): RowLine | null;
  /** The row's second line in place of the summary; the first non-null wins. */
  line(docId: string, item: VersionItem): string | null;
  /** Row-menu items after Restore, Restore this scene and Name this draft…. */
  menu(docId: string, item: VersionItem): readonly CommandId[];
}

export const ROW_EXTENSIONS: readonly RowExtension[] = [
  productionHistoryRow,
  sendDraftHistoryRow,
  copiesHistoryRow,
  linksHistoryRow,
];

/** Runs every extension's list-level hook once per History list mount. */
export function useRowExtensionList(docId: string): void {
  for (const extension of ROW_EXTENSIONS) extension.useList?.(docId);
}

/** Runs every extension's line hook unconditionally; returns the first non-null line. */
export function useRowExtensionLine(
  docId: string,
  item: VersionItem,
): RowLine | null {
  let chosen: RowLine | null = null;
  for (const extension of ROW_EXTENSIONS) {
    const line =
      extension.useLine !== undefined
        ? extension.useLine(docId, item)
        : (() => {
            const text = extension.line(docId, item);
            return text === null ? null : { text, tooltip: null };
          })();
    if (chosen === null && line !== null) chosen = line;
  }
  return chosen;
}
