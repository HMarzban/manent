// Annotations and things to settle.
import type { Term } from "./index.ts";
import { row } from "./row.ts";

export const ANNOTATION_TERMS: readonly Term[] = Object.freeze([
  ...row("saving", ["Note"], ["inline note", "script note"]),
  ...row("saving", ["Comment"], ["feedback"]),
  ...row("series", ["Round"], ["notes round"]),
  ...row("saving", ["Open", "Resolved"], ["closed", "done"]),
  ...row("saving", ["Text removed"], ["orphaned"]),
  ...row("saving", ["Overlap"], ["conflict"]),
  ...row("saving", ["To review"], []),
  ...row("saving", ["Recovered"], ["lost"]),
  ...row(
    "saving",
    ["Use mine", "Use Dana's", "Keep as merged", "Use this"],
    ["accept", "reject", "theirs"],
  ),
  ...row("saving", ["Use the other wording"], ["accept", "reject", "theirs"]),
  ...row("saving", ["Suggestion"], ["tracked change"]),
  ...row("writing", ["Alternate"], ["alt", "variant"]),
  ...row("series", ["Pitch"], []),
  ...row("writing", ["Cut"], ["cuts drawer"]),
  ...row("series", ["Names and facts"], [], ["bible", "shared lists"]),
  ...row("series", ["Fact", "Pin"], ["bible entry"]),
  ...row("series", ["Check", "Flag"], ["warning", "error"], ["proof"]),
  ...row("production", ["Consolidate"], []),
  ...row("writing", ["Merge"], []),
  ...row("series", ["Tag"], ["label"]),
  ...row("series", ["Set", "Term"], ["glossary entry"]),
]);
