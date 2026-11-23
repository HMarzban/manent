import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";

export const OFFLINE_SIGN_OUT: TourScenario = {
  id: "offline-sign-out",
  group: "Go offline",
  promise: "Signing out with changes waiting asks first.",
  setup: {
    userId: "sam",
    open: SLACK_WATER,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: "Choose Offline in Connection and type three lines.",
      highlight: "demo:connection",
    },
    { text: "Switch person to Dana.", highlight: "demo:person" },
  ],
  check:
    'Manent asks "Sign out with 3 changes waiting?", with Export a copy, Cancel and Sign out.',
  evidence: ["Sign out with 3 changes waiting?"],
  fresh: false,
  waitsFor: "sign_out_guard",
  hidden: null,
};
