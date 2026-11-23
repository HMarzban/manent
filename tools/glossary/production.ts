// Production.
import type { Term } from "./index.ts";
import { row } from "./row.ts";

export const PRODUCTION_TERMS: readonly Term[] = Object.freeze([
  ...row("production", ["Lock for production"], ["lock script"]),
  ...row(
    "production",
    ["Page numbers locked", "Scene numbers locked"],
    ["locked pages", "locked script"],
  ),
  ...row("production", ["Lock A-pages"], ["second lock level"]),
  ...row("production", ["Frozen"], []),
  ...row("production", ["Revision"], ["revision set"]),
  ...row("production", ["Issue", "Recall"], ["publish"]),
  ...row("production", ["Revision marks", "Asterisk"], ["star", "starred"]),
  ...row("production", ["Colour revised pages"], ["full-page tint"]),
  ...row("production", ["Tint revised pages in the file"], []),
  ...row("production", ["Mark revised", "Clear revised"], []),
  ...row(
    "production",
    [
      "Colour order",
      "Numbering scheme",
      "Revised page",
      "A-page",
      "Omitted",
      "Memo",
      "Packet",
      "Sides",
      "Eighths",
      "Renumber",
      "Full draft",
      "End production",
      "Unlock",
    ],
    [],
  ),
]);
