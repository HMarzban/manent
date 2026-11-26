import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const RUNDOWN_SHOW_TEMPLATE: TourScenario = {
  id: "rundown-show-template",
  group: "Rundown and prompter",
  promise:
    "Save a show's lineup as its default template so tomorrow's rundown starts ready.",
  setup: setupOf({
    userId: "dana",
    open: docPath("medium/the-late-desk/rundowns/day"),
  }),
  steps: [
    {
      text: "Open Title ▾ and choose Save template…",
      highlight: "template.save",
    },
    {
      text: "Keep This project's default selected and confirm Save template…: dates, timings and previous values are cleared.",
      highlight: "template.save",
    },
    {
      text: "Return to the project Library and choose New rundown: tomorrow's rundown opens with the saved rows and headers.",
      highlight: "rundown.new",
    },
  ],
  check:
    'The message confirms the template is saved "as this project\'s default", and "New rundown" opens a fresh rundown carrying the saved acts and rows.',
  evidence: ["as this project's default", "New rundown"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
