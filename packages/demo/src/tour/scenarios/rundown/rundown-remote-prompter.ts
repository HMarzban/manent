import type { TourScenario } from "../../format.ts";
import { docPath, seedDoc } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

const LANNICK_DAY_KEY = "medium/lannick-one-news/rundowns/day";
const LANNICK_DAY_ID = seedDoc(LANNICK_DAY_KEY).docId;

export const RUNDOWN_REMOTE_PROMPTER: TourScenario = {
  id: "rundown-remote-prompter",
  group: "Rundown and prompter",
  promise:
    "Control a presenter's prompter window from the rundown, and pause cleanly if the feed drops.",
  setup: setupOf(
    {
      userId: "ana",
      open: docPath(LANNICK_DAY_KEY),
    },
    [
      {
        userId: "ana",
        open: `/s/${LANNICK_DAY_ID}/prompter`,
      },
    ],
  ),
  steps: [
    {
      text: "Choose Take control in the state bar: the remote prompter strip appears above the grid.",
      highlight: "prompter:take_control",
    },
    {
      text: "Choose Play, adjust the speed, then select story 02 and choose Jump prompter here.",
      highlight: "prompter:play",
    },
    {
      text: "In the prompter window, scroll the page: the bar switches to Free scroll; choose Follow to rejoin.",
      highlight: "prompter:follow_switch",
    },
    {
      text: "Choose Stop the server: scrolling pauses cleanly and the last text stays on screen.",
      highlight: "demo:server",
    },
  ],
  check:
    'The prompter window moves smoothly on Play, switches to "Free scroll" when scrolled manually and back to "Follow" on click, and reads "Feed lost" with "scrolling paused" when the server stops.',
  evidence: ["Free scroll", "Follow", "Feed lost", "scrolling paused"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
