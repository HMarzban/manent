import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";

export const OFFLINE_RECOVERED: TourScenario = {
  id: "offline-recovered",
  group: "Go offline",
  promise: "Words typed into a scene someone else deleted are kept for you.",
  setup: {
    userId: "dana",
    open: SLACK_WATER,
    extraWindows: [{ userId: "priya", open: SLACK_WATER }],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: "In Dana's window choose Offline and type in scene 16.",
      highlight: "demo:connection",
    },
    { text: "In Priya's window delete scene 16.", highlight: "page" },
    {
      text: "In Dana's window choose Online.",
      highlight: "demo:connection",
    },
  ],
  check: 'The message reads "could not be placed — kept in Recovered text".',
  evidence: ["could not be placed — kept in Recovered text"],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
