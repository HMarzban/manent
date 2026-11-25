import type { TourScenario } from "../../format.ts";

export const LONG_FOLDERS_TRASH: TourScenario = {
  id: "long-folders-trash",
  group: "Long documents",
  promise:
    "Find your way round forty projects in folders, and bring back a script from Trash.",
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
      text: "Open Film — Production in the left column.",
      highlight: "library:folders",
    },
    {
      text: "Open Favourites.",
      highlight: "library:favourites",
    },
    {
      text: "Open Trash and choose Restore on The Glassblower.",
      highlight: "library.restore",
    },
  ],
  check:
    'Film — Production lists its four projects; Favourites holds Ned Ashby and the Lantern of Hours and Ward Nine; Trash reads "29 days left" on The Glassblower, and Restore says "Restored \'The Glassblower\' from Trash."',
  evidence: [
    "Film — Production",
    "29 days left",
    "Restored 'The Glassblower' from Trash.",
  ],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
