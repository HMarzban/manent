import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";

export const DESKTOP_PROMPTER_FILES: TourScenario = {
  id: "desktop-prompter-files",
  group: "Desktop",
  promise: "Write the prompter's files to a folder.",
  setup: {
    userId: "ana",
    open: docPath("medium/lannick-one-news/rundowns/day"),
    extraWindows: [],
    prepare: null,
    shell: "desktop",
  },
  steps: [
    {
      text: "Choose Prompter files… in the title menu.",
      highlight: "prompter.files",
    },
    {
      text: "Leave Encoding at UTF-8, choose Choose… and pick a place on this computer.",
      highlight: "prompter_files:place",
    },
    {
      text: "Choose Write prompter files: the state bar says where they go.",
      highlight: "state_bar",
    },
    {
      text: "Open that place: run-order.txt, and one file per story such as 01-tolle-exchange-library-council-votes-yes.txt.",
      highlight: "state_bar",
    },
  ],
  check:
    'The dialog offers "UTF-8" first, and the state bar reads "Writing prompter files to" with the path, and Stop.',
  evidence: ["UTF-8", "Writing prompter files to"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
