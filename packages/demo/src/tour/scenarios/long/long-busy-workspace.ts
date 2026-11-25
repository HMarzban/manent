import type { TourScenario } from "../../format.ts";

export const LONG_BUSY_WORKSPACE: TourScenario = {
  id: "long-busy-workspace",
  group: "Long documents",
  promise:
    "A studio of forty projects is as quick to find your way in as one desk.",
  setup: {
    userId: "dana",
    open: "/",
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    { text: "Open the workspace switcher.", highlight: "workspace_switcher" },
    { text: "Choose Lanternfield Studios.", highlight: "workspace_switcher" },
  ],
  check:
    'The switcher lists "Writers\' room" and "Lanternfield Studios", and the Library lists forty projects.',
  evidence: ["Writers' room", "Lanternfield Studios"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
