import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const RUNDOWN_PROMPTER: TourScenario = {
  id: "rundown-prompter",
  group: "Rundown and prompter",
  promise:
    "Send a script to the prompter, with its text size, dark and mirror.",
  setup: setupOf({
    userId: "ana",
    open: docPath("medium/the-late-desk/rundowns/day"),
  }),
  steps: [
    {
      text: "Select row 2, Monologue, and choose Open beside: its state bar holds Send to prompter.",
      highlight: "rundown.openBeside",
    },
    {
      text: "Choose Send to prompter.",
      highlight: "prompter.send",
    },
    {
      text: "Choose Present on prompter in View: the prompter window opens.",
      highlight: "view.presentOnPrompter",
    },
    {
      text: "In the prompter window, change Text size, turn Dark off and turn Mirror on.",
      highlight: "prompter:window",
    },
  ],
  check:
    'The message reads "Monologue on prompter" and the time; the prompter window shows only speeches, such as "You knew. You all knew.", and its bar reads "Live".',
  evidence: ["Monologue on prompter", "You knew. You all knew.", "Live"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
