// People and access.
import type { Term } from "./index.ts";
import { row } from "./row.ts";

export const PEOPLE_TERMS: readonly Term[] = Object.freeze([
  ...row(
    "sharing",
    ["Owner", "Can edit", "Can comment", "Can view"],
    ["admin"],
  ),
  ...row("sharing", ["Can also"], ["a fifth role", "per-feature permission"]),
  ...row("sharing", ["Group"], ["distribution group", "show group"]),
  ...row("sharing", ["Share"], ["invite"]),
  ...row("history", ["Send"], ["publish", "release"]),
  ...row(
    "sharing",
    ["Link", "Draft link", "prompter link"],
    ["deep link", "reader link", "invitation"],
  ),
  ...row("sharing", ["Reader"], ["viewer"]),
  ...row("sharing", ["Viewers"], []),
  ...row(
    "sharing",
    ["Watermark", "Sent and opened"],
    ["send log", "access log"],
  ),
  ...row("series", ["Writer"], ["scene owner"]),
  ...row(
    "series",
    ["Progress", "Not started", "Drafting", "Handed in"],
    ["status", "state"],
  ),
  ...row("series", ["Driver", "Take keys"], ["presenter"]),
  ...row("saving", ["Follow", "Following"], []),
  ...row("saving", ["Cursor"], ["remote caret", "pointer", "name flag"]),
  ...row("workspaces", ["Account"], ["login"]),
  ...row("sharing", ["View only", "Read-only"], []),
]);
