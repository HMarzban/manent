import type { TourScenario } from "../../format.ts";
import { LONG_NIGHT } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_ROLES: TourScenario = {
  id: "together-roles",
  group: "Work together",
  promise:
    "Each person can do what their role allows, and the server holds them to it.",
  setup: setupOf({ userId: "leo", open: LONG_NIGHT }),
  steps: [
    {
      text: "Try to type: Leo can read and comment, not edit.",
      highlight: "state_bar",
    },
    {
      text: "Switch person to Sam: he can edit, but issuing pages is Priya's.",
      highlight: "demo:person",
    },
  ],
  check:
    'Leo\'s state bar reads "View only — you can comment"; as Sam there is no Issue Pink… in the state bar.',
  evidence: ["View only — you can comment"],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
