import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";

export const OFFLINE_WRITE: TourScenario = {
  id: "offline-write",
  group: "Go offline",
  promise:
    "Keep writing with no connection; everything is there when you come back.",
  setup: {
    userId: "dana",
    open: SLACK_WATER,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    { text: "Choose Offline in Connection.", highlight: "demo:connection" },
    {
      text: "Type a new line of action, then reload the page: it is still there.",
      highlight: "page",
    },
    { text: "Choose Online.", highlight: "demo:connection" },
    { text: "Open History.", highlight: "tab:history" },
  ],
  check:
    'Offline the status reads "Saved · Offline, 1 waiting"; online it reads "Saved · Synced", and History keeps "Before reconnect — this device".',
  evidence: [
    "Saved · Offline, 1 waiting",
    "Saved · Synced",
    "Before reconnect — this device",
  ],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
