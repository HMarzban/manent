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
      text: "Choose Open… in File and pick pigeon-post.fountain.",
      highlight: "file.open",
    },
    {
      text: "Drop low-tide-blue.fdx on the window.",
      highlight: "page",
    },
  ],
  check:
    "Pigeon Post opens with its notes, sections and synopses, and the FDX keeps its locked pages and Blue marks.",
  evidence: ["Pigeon Post"],
  fresh: false,
  waitsFor: "imports",
  hidden: null,
};
