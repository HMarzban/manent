import type { TourScenario } from "../../format.ts";
import { setupOf } from "../setup.ts";

export const WRITE_FIRST_RUN: TourScenario = {
  id: "write-first-run",
  group: "Write",
  promise: "Start writing at once: no account, nothing to set up.",
  setup: setupOf({ userId: "you", open: "/" }, [], "you-first-run"),
  steps: [
    { text: "Type a scene heading: INT. KITCHEN - NIGHT", highlight: "page" },
    {
      text: "Your words are already saved in this browser.",
      highlight: "status:device",
    },
    {
      text: "Open the Sync centre and choose Sign in to sync.",
      highlight: "app.signInToSync",
    },
  ],
  check:
    'The status reads "Saved · Only in this browser — not backed up" until you sign in, then "Saved · Synced".',
  evidence: ["Saved · Only in this browser — not backed up", "Saved · Synced"],
  fresh: true,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
