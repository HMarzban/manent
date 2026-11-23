import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";

export const OFFLINE_RECOVERED: TourScenario = {
  id: "offline-recovered",
  group: "Go offline",
  promise: "Words typed into a scene someone else deleted are kept for you.",
  setup: {
    userId: "sam",
    open: SLACK_WATER,
    extraWindows: [{ userId: "dana", open: SLACK_WATER }],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: "In Sam's window choose Offline and type in scene 9.",
      highlight: "demo:connection",
    },
    { text: "In Dana's window delete scene 9.", highlight: "page" },
    {
      text: "In Sam's window choose Online.",
      highlight: "demo:connection",
    },
  ],
  check: 'The message reads "could not be placed — kept in Recovered text".',
  evidence: ["could not be placed — kept in Recovered text"],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
