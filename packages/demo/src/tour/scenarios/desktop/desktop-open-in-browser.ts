import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";

export const DESKTOP_OPEN_IN_BROWSER: TourScenario = {
  id: "desktop-open-in-browser",
  group: "Desktop",
  promise: "A second person joins from the browser.",
  setup: {
    userId: "dana",
    open: SLACK_WATER,
    extraWindows: [],
    prepare: null,
    shell: "desktop",
  },
  steps: [
    {
      text: "Choose File → Open in browser, and choose Priya there.",
      highlight: "app.openInBrowser",
    },
    { text: "Type in either window.", highlight: "page" },
  ],
  check: 'Both windows read "Saved · Synced" and show each other\'s typing.',
  evidence: ["Saved · Synced"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
