// Places and containers.
import type { Term } from "./index.ts";
import { row } from "./row.ts";

export const PLACE_TERMS: readonly Term[] = Object.freeze([
  ...row("workspaces", ["Library"], ["home", "dashboard"]),
  ...row("workspaces", ["Workspace"], ["organisation", "account"]),
  ...row("workspaces", ["Project"], ["title", "show"]),
  ...row(
    "formats",
    ["Film", "Series", "Show", "News", "Podcast", "Book", "Game", "Stage play"],
    ["show"],
  ),
  ...row("series", ["Season", "Episode"], []),
  ...row("series", ["Due"], ["deadline"]),
  ...row("workspaces", ["Folder"], ["private area"]),
  ...row("workspaces", ["Favourite"], ["bookmark"]),
  ...row("workspaces", ["Continue"], ["recents"]),
  ...row("workspaces", ["Trash"], ["bin", "archive"]),
  ...row("sharing", ["People"], ["members", "team"]),
]);
