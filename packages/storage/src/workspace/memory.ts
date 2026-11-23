// Each workspace's settings kept in memory, for the in-memory driver.
import type { WorkspaceSettingsStore } from "../ports/index.ts";

/** The control file's rows. Values are replaced, never changed in place. */
export interface WorkspaceSettingsTables {}

export function createWorkspaceSettingsTables(): WorkspaceSettingsTables {
  return {};
}

/** The store over the storage's tables; `commit` writes through whatever fault is armed. */
export function createMemoryWorkspaceSettings(_options: {
  now: () => number;
  read: () => WorkspaceSettingsTables;
  commit: <T>(apply: () => T) => T;
}): WorkspaceSettingsStore {
  return {};
}
