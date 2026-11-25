import type { TourScenario } from "../../format.ts";
import { LONG_NIGHT } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_CAN_ALSO: TourScenario = {
  id: "together-can-also",
  group: "Work together",
  promise: "Take a permission away with one tick, and the server holds to it.",
  setup: setupOf(
    { userId: "dana", open: LONG_NIGHT },
    [{ userId: "priya", open: LONG_NIGHT }],
    "together-can-also-ready",
  ),
  steps: [
    {
      text: "Open Project settings and choose People.",
      highlight: "project.openSettings",
    },
    {
      text: "Untick Issue revisions and lock page numbers on Priya Nair's row.",
      highlight: "workspace:can_also",
    },
    {
      text: "In Priya's window, reopen the script: Issue Pink… has gone from the state bar.",
      highlight: "state_bar",
    },
    {
      text: "Tick it again.",
      highlight: "workspace:can_also",
    },
  ],
  check:
    'Dana\'s message reads "Priya can no longer issue revisions or lock page numbers in The Long Night."; after the tick is set again Priya\'s state bar offers "Issue Pink…" once more.',
  evidence: [
    "Priya can no longer issue revisions or lock page numbers in The Long Night.",
    "Issue Pink…",
  ],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
