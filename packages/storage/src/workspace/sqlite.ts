// Each workspace's settings over SQLite, in the control file.
import type { Database } from "bun:sqlite";
import type { WorkspaceSettingsStore } from "../ports/index.ts";

export function createSqliteWorkspaceSettings(_options: {
  db: Database;
  now: () => number;
}): WorkspaceSettingsStore {
  return {};
}
