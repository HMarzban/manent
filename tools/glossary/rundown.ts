// Rundown, prompter and output.
import type { Term } from "./index.ts";
import { row } from "./row.ts";

export const RUNDOWN_TERMS: readonly Term[] = Object.freeze([
  ...row("rundown", ["Air", "Target", "Over", "Under"], []),
  ...row(
    "rundown",
    ["Dur", "Cume", "Start", "Back"],
    ["front time", "back time"],
  ),
  ...row("rundown", ["Columns"], ["fields"]),
  ...row("rundown", ["Air window"], []),
  ...row("rundown", ["On prompter", "Changed — not on prompter"], ["dirty"]),
  ...row("rundown", ["Send previous"], []),
  ...row("rundown", ["Live", "Feed lost"], ["connected"]),
  ...row("files", ["Export", "File", "File type"], ["download", "save as"]),
  ...row("files", ["Part", "Split into parts"], ["volume"]),
  ...row("pages", ["Print"], []),
  ...row("history", ["The pages as they will go"], ["proof"]),
  ...row("files", ["Import"], ["open"]),
  ...row("files", ["Project archive"], ["backup", "zip"]),
]);
