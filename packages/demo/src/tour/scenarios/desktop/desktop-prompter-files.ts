import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";

export const DESKTOP_PROMPTER_FILES: TourScenario = {
  id: "desktop-prompter-files",
  group: "Desktop",
  promise: "Write the prompter's files to a folder.",
  setup: {
    userId: "ana",
    open: docPath("medium/lannick-one-news/stories/01"),
    extraWindows: [],
    prepare: null,
    shell: "desktop",
  },
  steps: [
    { text: "Choose a folder for the prompter's files.", highlight: "page" },
    { text: "Send the newscast to the prompter.", highlight: "page" },
  ],
  check:
    "The run-order and each story's file are written to the folder you chose.",
  evidence: ["run-order"],
  fresh: false,
  waitsFor: "prompter_files",
  hidden: null,
};
