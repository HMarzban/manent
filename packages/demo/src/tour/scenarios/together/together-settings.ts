import type { TourScenario } from "../../format.ts";
import { LAMP_ROOM } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_SETTINGS: TourScenario = {
  id: "together-settings",
  group: "Work together",
  promise: "Preferences follow you, settings are shared.",
  setup: setupOf(
    { userId: "sam", open: LAMP_ROOM },
    [
      { userId: "sam", open: LAMP_ROOM },
      { userId: "dana", open: LAMP_ROOM },
    ],
    "lamp-room-us-letter",
  ),
  steps: [
    {
      text: "In the first window open Preferences and set Theme to Dark.",
      highlight: "setting:appearance.theme",
    },
    {
      text: "Open Script settings and set Paper to A4.",
      highlight: "setting:script.paper",
    },
  ],
  check:
    "Sam's other window turns dark and Dana's does not; Dana's reads \"Sam changed paper size to A4 · 12 → 11 pages\", and all three show the same page numbers.",
  evidence: ["Sam changed paper size to A4 · 12 → 11 pages"],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
