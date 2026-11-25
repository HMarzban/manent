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
      text: "Choose Offline in Connection, then type three lines.",
      highlight: "demo:connection",
    },
    {
      text: "Open Commands and choose Sign out.",
      highlight: "app.signOut",
    },
    {
      text: "Read what it says, then choose Sign out and choose Sam again.",
      highlight: "workspace:sign_out",
    },
    {
      text: "Choose Online in Connection.",
      highlight: "demo:connection",
    },
  ],
  check:
    'The dialog reads "Sign out with 3 changes waiting?" with "Export a copy"; after choosing Sam again and going online the status reads "Saved · Synced".',
  evidence: [
    "Sign out with 3 changes waiting?",
    "Export a copy",
    "Saved · Synced",
  ],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
