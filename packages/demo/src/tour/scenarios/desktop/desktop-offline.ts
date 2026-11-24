import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";

export const DESKTOP_OFFLINE: TourScenario = {
  id: "desktop-offline",
  group: "Desktop",
  promise:
    "Write in the desktop app with no network; everything is there when it comes back.",
  setup: {
    userId: "dana",
    open: SLACK_WATER,
    extraWindows: [],
    prepare: null,
    shell: "desktop",
  },
  steps: [
    { text: "Choose Offline in Connection.", highlight: "demo:connection" },
    { text: "Type three lines.", highlight: "page" },
    { text: "Choose Online.", highlight: "demo:connection" },
  ],
  check:
    'The status reads "Saved · Offline, 3 waiting", then "Saved · Synced".',
  evidence: ["Saved · Offline, 3 waiting", "Saved · Synced"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
