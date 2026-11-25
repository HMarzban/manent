import type { TourScenario } from "../../format.ts";
import { LAMP_ROOM } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const WRITE_LAYOUT_ENGINE: TourScenario = {
  id: "write-layout-engine",
  group: "Write",
  promise:
    "Move a script to the newer layout engine, seeing the page count first.",
  setup: setupOf({ userId: "sam", open: LAMP_ROOM }),
  steps: [
    {
      text: "Open Script settings.",
      highlight: "doc.scriptSettings",
    },
    {
      text: "Under Layout engine, read which engine lays this script out and what the newer one would do.",
      highlight: "setting:script.engineVersion",
    },
    {
      text: "Choose Update layout engine.",
      highlight: "setting:script.engineVersion",
    },
  ],
  check:
    'The row reads "Layout engine 2 is available" with both page counts; after Update layout engine the message reads "Layout engine is now 2".',
  evidence: ["Layout engine 2 is available", "Layout engine is now 2"],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
