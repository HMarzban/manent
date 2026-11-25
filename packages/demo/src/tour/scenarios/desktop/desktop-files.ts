import type { TourScenario } from "../../format.ts";

export const DESKTOP_FILES: TourScenario = {
  id: "desktop-files",
  group: "Desktop",
  promise: "Open and drop Fountain, FDX, PDF and Ink files.",
  setup: {
    userId: "sam",
    open: "/",
    extraWindows: [],
    prepare: null,
    shell: "desktop",
  },
  steps: [
    {
      text: "Choose Open… in the File menu and open Pigeon Post.fountain.",
      highlight: "file.open",
    },
    {
      text: "Drop Low Tide Blue.fdx on the window.",
      highlight: "message_slot",
    },
    {
      text: "Drop Every Key But One first draft.pdf on the window.",
      highlight: "message_slot",
    },
    {
      text: "Drop The Keeper's Logbook.ink on the window.",
      highlight: "message_slot",
    },
  ],
  check:
    "Each file opens as a new script and the message slot says what came in, ending with \"Imported 'The Keeper's Logbook': 71 lines, 5 knots.\"",
  evidence: ["Imported 'The Keeper's Logbook': 71 lines, 5 knots."],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
