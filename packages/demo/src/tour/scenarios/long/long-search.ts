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
    {
      text: "Choose Search this workspace… and type Tamsin Hale.",
      highlight: "library.search",
    },
    {
      text: "In Filter, choose Folder, then Audio, Books & Games.",
      highlight: "search:filter",
    },
  ],
  check:
    'The search lists "4 documents", among them "The Keeper of the Last Bell: The Complete Manuscript"; with the folder chosen it lists "1 document".',
  evidence: [
    "4 documents",
    "The Keeper of the Last Bell: The Complete Manuscript",
    "1 document",
  ],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
