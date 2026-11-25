import type { TourScenario } from "../../format.ts";
import { EKBO } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const WRITE_RENAME_CHARACTER: TourScenario = {
  id: "write-rename-character",
  group: "Write",
  promise: "Rename a character everywhere in one step, and undo it in one.",
  setup: setupOf({ userId: "sam", open: EKBO }),
  steps: [
    {
      text: "Choose Rename character in the Script menu, and pick RAHEL.",
      highlight: "script.renameCharacter",
    },
    {
      text: "Type RUTH and press Enter: every cue changes, and (V.O.) stays.",
      highlight: "page",
    },
    {
      text: "Choose Undo: every cue reads RAHEL again.",
      highlight: "edit.undo",
    },
  ],
  check:
    'The message reads "Renamed RAHEL to RUTH in" with the number of cues, and the cues read "RUTH (V.O.)" until Undo puts RAHEL back.',
  evidence: ["Renamed RAHEL to RUTH in", "RUTH (V.O.)"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
