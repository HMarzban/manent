// History.
import type { Term } from "./index.ts";
import { row } from "./row.ts";

export const HISTORY_TERMS: readonly Term[] = Object.freeze([
  ...row("history", ["Version"], [], ["snapshot", "backup"]),
  ...row("history", ["Draft"], ["named version", "sent draft", "my draft"]),
  ...row("history", ["Working"], ["current", "latest"]),
  ...row("series", ["Ladder", "Stage"], ["draft rail"]),
  ...row(
    "history",
    ["History"],
    [],
    ["version history", "timeline", "time machine"],
  ),
  ...row("history", ["Changes since"], [], ["compare", "diff", "what's new"]),
  ...row("series", ["Changed since you opened"], ["updated"]),
  ...row("history", ["Filter"], []),
  ...row("saving", ["Change"], ["edit", "update"]),
  ...row("history", ["Restore"], ["revert", "roll back"]),
  ...row("history", ["Before restore"], []),
  ...row("history", ["Duplicate"], ["make a copy"]),
  ...row(
    "series",
    ["Studio", "Network", "Table", "Record", "Animatic", "Conformed"],
    [],
  ),
  ...row("history", ["Before hand-in"], []),
]);
