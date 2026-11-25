// Each workspace's settings kept in memory, for the in-memory driver.
import type {
  WorkspaceSettingRow,
  WorkspaceSettingsStore,
} from "../ports/index.ts";

const pairKey = (workspaceId: string, key: string): string =>
  JSON.stringify([workspaceId, key]);

/** The control file's rows. Values are replaced, never changed in place. */
export interface WorkspaceSettingsTables {
  /** By workspaceId and key. */
  rows: Map<string, WorkspaceSettingRow>;
}

export function createWorkspaceSettingsTables(): WorkspaceSettingsTables {
  return { rows: new Map() };
}

const copyRow = (row: WorkspaceSettingRow): WorkspaceSettingRow => ({ ...row });

// As SQLite orders `"key" ASC`.
const byKey = (a: WorkspaceSettingRow, b: WorkspaceSettingRow): number =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

/** The store over the storage's tables; `commit` writes through whatever fault is armed. */
export function createMemoryWorkspaceSettings(options: {
  now: () => number;
  read: () => WorkspaceSettingsTables;
  commit: <T>(apply: () => T) => T;
}): WorkspaceSettingsStore {
  const { now, read, commit } = options;
  return {
    get(workspaceId, key) {
      const row = read().rows.get(pairKey(workspaceId, key));
      return row === undefined ? null : copyRow(row);
    },
    list: (workspaceId) =>
      [...read().rows.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .toSorted(byKey)
        .map(copyRow),
    set(workspaceId, key, value, updatedByUserId) {
      const stored: WorkspaceSettingRow = {
        workspaceId,
        key,
        value,
        updatedByUserId,
        updatedAt: now(),
      };
      commit(() => {
        read().rows.set(pairKey(workspaceId, key), stored);
      });
      return copyRow(stored);
    },
    remove: (workspaceId, key) =>
      commit(() => read().rows.delete(pairKey(workspaceId, key))),
  };
}
