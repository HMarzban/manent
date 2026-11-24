import type { TourScenario } from "../../format.ts";
import { FERRY } from "../documents.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_LINKS: TourScenario = {
  id: "together-links",
  group: "Work together",
  promise:
    "Copy a link to the script or to its changes, and it opens the same view for someone else.",
  setup: setupOf({ userId: "dana", open: FERRY }, [
    { userId: "sam", open: FERRY },
  ]),
  steps: [
    {
      text: "Choose Copy link in the title menu.",
      highlight: "doc.copyLink",
    },
    {
      text: 'Open History, choose Changes since and pick "Studio draft", then choose Copy link above the changes.',
      highlight: "history.copyLink",
    },
    {
      text: "In Sam's window, paste the link into the address bar.",
      highlight: "page",
    },
  ],
  check:
    'Dana reads "Copied a link to the changes since \'Studio draft\'.", and Sam\'s window opens 204 reading "Showing changes since Studio draft".',
  evidence: [
    "Copied a link to the changes since 'Studio draft'.",
    "Showing changes since Studio draft",
  ],
  fresh: false,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
