import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_STYLE: TourScenario = {
  id: "together-style",
  group: "Work together",
  promise:
    "Change a style once for the series, and every episode that is not locked follows.",
  setup: setupOf(
    { userId: "dana", open: SLACK_WATER },
    [],
    "together-style-ready",
  ),
  steps: [
    {
      text: "Choose Project settings in the title menu.",
      highlight: "project.openSettings",
    },
    {
      text: "Under Element style, choose Scene Heading and set Space before to 2 lines.",
      highlight: "setting:project.style",
    },
    {
      text: "Go back to 205 and open Script settings.",
      highlight: "doc.scriptSettings",
    },
  ],
  check:
    'Project settings reads "2 of 6 episodes have their page numbers locked and keep the style they were locked with."; in 205 the style row reads "From Harbour Lights\' project settings" with Open project settings.',
  evidence: [
    "2 of 6 episodes have their page numbers locked and keep the style they were locked with.",
    "From Harbour Lights' project settings",
  ],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
