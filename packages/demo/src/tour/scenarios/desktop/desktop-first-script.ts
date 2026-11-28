import type { TourScenario } from "../../format.ts";

export const DESKTOP_FIRST_SCRIPT: TourScenario = {
  id: "desktop-first-script",
  group: "Desktop",
  promise:
    "A script you start on this device is yours until you sign in to sync.",
  setup: {
    userId: "you",
    open: "/",
    extraWindows: [],
    prepare: "you-first-run",
    shell: "desktop",
  },
  steps: [
    { text: "Type a scene heading.", highlight: "page" },
    {
      text: "Open the Sync centre and choose Sign in to sync.",
      highlight: "app.signInToSync",
    },
  ],
  check:
    'The status reads "Saved · On this device only", then "Saved · Synced".',
  evidence: ["Saved · On this device only", "Saved · Synced"],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
