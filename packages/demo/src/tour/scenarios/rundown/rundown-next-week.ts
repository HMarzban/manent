import type { TourScenario } from "../../format.ts";
import { setupOf } from "../setup.ts";

export const RUNDOWN_NEXT_WEEK: TourScenario = {
  id: "rundown-next-week",
  group: "Rundown and prompter",
  promise: "Plan next week's newscasts, one rundown per date.",
  setup: setupOf({ userId: "ana", open: "/" }),
  steps: [
    {
      text: "In the Library, open Lannick One News: its rundowns are listed by date, next week's with 9 rows.",
      highlight: "library:rundowns",
    },
    {
      text: "Choose New rundown: it takes the first day after today that has no rundown.",
      highlight: "rundown.new",
    },
    {
      text: "Choose Add row and type a story.",
      highlight: "rundown.addRow",
    },
  ],
  check:
    'The list shows next week\'s rundown with "9 rows"; the message reads "New rundown for" and the new date, and the new rundown reads "Add a row or drag a script here" until its first row.',
  evidence: ["9 rows", "New rundown for", "Add a row or drag a script here"],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
