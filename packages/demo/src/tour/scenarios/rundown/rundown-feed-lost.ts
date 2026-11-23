import type { TourScenario } from "../../format.ts";
import { setupOf } from "../setup.ts";

export const RUNDOWN_FEED_LOST: TourScenario = {
  id: "rundown-feed-lost",
  group: "Rundown and prompter",
  promise:
    "If the prompter loses its feed it keeps the last text and says when.",
  setup: setupOf({ userId: "ana", open: "/" }),
  steps: [
    {
      text: "Open today's newscast of Lannick One News on the prompter.",
      highlight: "page",
    },
    { text: "Choose Stop the server.", highlight: "demo:server" },
    { text: "Choose Start the server.", highlight: "demo:server" },
  ],
  check:
    'The prompter reads "Feed lost" with the time, then "showing last received", and resumes without a reload.',
  evidence: ["Feed lost", "showing last received"],
  fresh: false,
  waitsFor: "prompter",
  hidden: null,
};
