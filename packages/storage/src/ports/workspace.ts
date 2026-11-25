// Each workspace's settings, in the control file.

/** One workspace setting row; `updatedAt` is epoch ms. */
export interface WorkspaceSettingRow {
  workspaceId: string;
  key: string;
  value: string;
  updatedByUserId: string;
  updatedAt: number;
}

export interface WorkspaceSettingsStore {
  /** Null when `key` is not set for `workspaceId`. */
  get(workspaceId: string, key: string): WorkspaceSettingRow | null;
  /** Every setting for `workspaceId`, ordered ascending by `key`. */
  list(workspaceId: string): WorkspaceSettingRow[];
  /** Inserts or updates `(workspaceId, key)` stamped with the injected clock's `now()`. */
  set(
    workspaceId: string,
    key: string,
    value: string,
    updatedByUserId: string,
  ): WorkspaceSettingRow;
  /** Removes `(workspaceId, key)`; returns true when a row was removed, false when absent. */
  remove(workspaceId: string, key: string): boolean;
}
