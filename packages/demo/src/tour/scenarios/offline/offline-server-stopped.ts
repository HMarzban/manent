import type { TourScenario } from "../../format.ts";
import { SLACK_WATER } from "../documents.ts";

export const OFFLINE_SERVER_STOPPED: TourScenario = {
  id: "offline-server-stopped",
  group: "Go offline",
  promise:
    "Stop the server: you keep writing, and everything is there when it is back.",
  setup: {
    userId: "sam",
    open: SLACK_WATER,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    { text: "Choose Stop the server.", highlight: "demo:server" },
    { text: "Type a line.", highlight: "page" },
    { text: "Choose Start the server.", highlight: "demo:server" },
  ],
  check:
    'While it is stopped the status reads "Saved · Can\'t reach Manent, 1 waiting"; afterwards "Saved · Synced".',
  evidence: ["Can't reach Manent, 1 waiting", "Saved · Synced"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
