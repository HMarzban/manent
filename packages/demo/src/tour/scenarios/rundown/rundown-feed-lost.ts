import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const RUNDOWN_FEED_LOST: TourScenario = {
  id: "rundown-feed-lost",
  group: "Rundown and prompter",
  promise:
    "If the prompter loses its feed it keeps the last text and says when.",
  setup: setupOf({
    userId: "ana",
    open: docPath("medium/lannick-one-news/rundowns/day"),
  }),
  steps: [
    {
      text: "Choose Present on prompter in View: the prompter window reads Live.",
      highlight: "view.presentOnPrompter",
    },
    {
      text: "In the rundown's window, choose Stop the server.",
      highlight: "demo:server",
    },
    {
      text: "The prompter window keeps its text and says when its feed stopped.",
      highlight: "prompter:feed",
    },
    {
      text: "Choose Start the server: the window reads Live again, with no reload.",
      highlight: "demo:server",
    },
  ],
  check:
    'Within three seconds the bar reads "Feed lost" with the time of the last frame, then "— showing last received", and the text stays; after Start it reads "Live".',
  evidence: ["Feed lost", "— showing last received", "Live"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
