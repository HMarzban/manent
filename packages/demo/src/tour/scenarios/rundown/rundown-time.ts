import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

const LATE_DESK_DAY = docPath("medium/the-late-desk/rundowns/day");

export const RUNDOWN_TIME: TourScenario = {
  id: "rundown-time",
  group: "Rundown and prompter",
  promise: "Time a show to the second, and see it run over.",
  setup: setupOf({ userId: "ana", open: LATE_DESK_DAY }, [
    { userId: "dana", open: LATE_DESK_DAY },
  ]),
  steps: [
    {
      text: "The state bar gives the show's air time, its target and how far over it runs.",
      highlight: "state_bar",
    },
    {
      text: "Select row 5, Benny's Mailbag, and choose Open beside: its script opens beside the rundown.",
      highlight: "rundown.openBeside",
    },
    {
      text: "Delete one of the letters: the row's Dur, marked ●, changes as you type.",
      highlight: "rundown:grid",
    },
    {
      text: "In Dana's window, Dur, Cume, Start, Back and Over change too.",
      highlight: "state_bar",
    },
  ],
  check:
    'The state bar reads "Target 42:00 · Over 0:46" and the status bar "Row 5 of 16 · Benny\'s Mailbag"; after the delete the row\'s Dur, Cume, Start and Back and the Over figure drop, in both windows.',
  evidence: ["Target 42:00", "Over 0:46", "Row 5 of 16 · Benny's Mailbag"],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
