// The documents in Trash, in the control file.

/** One trashed document row; `home` is the canonical `"project:<id>"` or `"user:<id>"` key, instants in epoch ms. */
export interface TrashRow {
  docId: string;
  workspaceId: string;
  home: string;
  deletedByUserId: string;
  deletedAt: number;
  purgeAfter: number;
}

export interface TrashStore {
  /** Inserts or replaces the row for `row.docId`. */
  put(row: TrashRow): void;
  /** Null when `docId` is not in Trash. */
  get(docId: string): TrashRow | null;
  /** Removes `docId` from Trash; does nothing when absent. */
  remove(docId: string): void;
  /** Trashed rows in `workspaceId`, newest first (`deletedAt` descending, then `docId` ascending). */
  listByWorkspace(workspaceId: string): TrashRow[];
  /** Rows whose `purgeAfter <= nowMs`, ordered by `purgeAfter` ascending then `docId` ascending. */
  due(nowMs: number): TrashRow[];
}
