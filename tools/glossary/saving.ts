// Saving and syncing.
import type { Term } from "./index.ts";
import { row } from "./row.ts";

export const SAVING_TERMS: readonly Term[] = Object.freeze([
  ...row("saving", ["Status"], ["state", "stage"]),
  ...row("saving", ["Server"], ["cloud", "backend"]),
  ...row("saving", ["Saved"], []),
  ...row("saving", ["Synced"], ["backed up"]),
  ...row("saving", ["Offline", "waiting"], ["pending", "queued"]),
  ...row("saving", ["Sync centre"], []),
  ...row("saving", ["Receipt"], ["log"]),
  ...row(
    "saving",
    ["On this device only", "Only in this browser", "Not on this device"],
    ["local"],
  ),
]);
