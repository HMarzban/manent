import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const RUNDOWN_VIEW_AND_HISTORY: TourScenario = {
  id: "rundown-view-and-history",
  group: "Rundown and prompter",
  promise:
    "View a live rundown read-only, inspect every change in History, and restore a single row safely.",
  setup: setupOf({
    userId: "leo",
    open: docPath("medium/the-late-desk/rundowns/day"),
  }),
  steps: [
    {
      text: "Leo has Can view: the live rundown opens in View only with Details and read-only previous values.",
      highlight: "rundown:grid",
    },
    {
      text: "Open History: inspect added, removed, moved and changed cells in In the grid and Side by side.",
      highlight: "tab:history",
    },
    {
      text: "Step through edits with Next change.",
      highlight: "history.nextChange",
    },
    {
      text: "Switch person to Ana and choose Restore row on a changed row: confirm the dialog showing Before restore.",
      highlight: "demo:person",
    },
  ],
  check:
    'Leo sees "View only", compares changes in "In the grid" and "Side by side", and Ana\'s restore dialog names "\'Before restore\'".',
  evidence: ["View only", "In the grid", "Side by side", "Before restore"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
