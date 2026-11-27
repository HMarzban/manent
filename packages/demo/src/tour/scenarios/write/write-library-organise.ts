import type { TourScenario } from "../../format.ts";

export const WRITE_LIBRARY_ORGANISE: TourScenario = {
  id: "write-library-organise",
  group: "Write",
  promise:
    "Organise projects in nested folders, drag a script into a folder, and switch between Favourites, Private drafts and Preferences.",
  setup: {
    userId: "dana",
    open: "/",
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: "Expand Scripted in the left column, drag The Lamp Room onto Features, then choose Undo in the banner.",
      highlight: "library:folders",
    },
    {
      text: "Open Favourites to view your favourite projects and scripts.",
      highlight: "library:favourites",
    },
    {
      text: "Open Private to read and start drafts kept for yourself.",
      highlight: "library:private",
    },
    {
      text: "Open your avatar at the top right to reach Preferences and your account.",
      highlight: "title:account",
    },
  ],
  check:
    "Dropping The Lamp Room onto Features says \"Moved 'The Lamp Room' to Scripted › Features.\" and Undo returns it; Favourites lists Harbour Lights and The Long Night; Private holds The Winter Timetable; the account menu offers Preferences.",
  evidence: [
    "Moved 'The Lamp Room' to Scripted › Features.",
    "Harbour Lights",
    "The Winter Timetable",
    "Preferences",
  ],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
