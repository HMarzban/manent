import type { TourScenario } from "../../format.ts";

export const LONG_SEARCH: TourScenario = {
  id: "long-search",
  group: "Long documents",
  promise: "Search every project for a name.",
  setup: {
    userId: "dana",
    open: "/",
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: "Choose Lanternfield Studios in the workspace switcher.",
      highlight: "workspace_switcher",
    },
    { text: "Search every project for Tamsin Hale.", highlight: "page" },
  ],
  check: 'Search finds "Tamsin Hale" in four projects.',
  evidence: ["Tamsin Hale"],
  fresh: false,
  waitsFor: "search",
  hidden: null,
};
