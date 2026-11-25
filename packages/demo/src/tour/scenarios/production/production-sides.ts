import type { TourScenario } from "../../format.ts";
import { LONG_NIGHT } from "../documents.ts";

export const PRODUCTION_SIDES: TourScenario = {
  id: "production-sides",
  group: "Production",
  promise: "Make sides for the scenes shooting tomorrow.",
  setup: {
    userId: "priya",
    open: LONG_NIGHT,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: "In the Scenes tab, select scenes 24 to 26A.",
      highlight: "tab:scenes",
    },
    {
      text: "Choose Include in sides… in a selected scene's row menu.",
      highlight: "production.includeInSides",
    },
    { text: "Choose Export 1 file.", highlight: "send:confirm" },
  ],
  check:
    'Export opens with "Sides" chosen and the range "Sc. 24 · INT. KOWAL FLAT - KITCHEN - NIGHT" to "Sc. 26A · INT. CALLOW PARADE - PHARMACY - NIGHT", and says "Exported \'The Long Night\'."',
  evidence: [
    "Sides",
    "Sc. 24 · INT. KOWAL FLAT - KITCHEN - NIGHT",
    "Sc. 26A · INT. CALLOW PARADE - PHARMACY - NIGHT",
    "Exported 'The Long Night'.",
  ],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
