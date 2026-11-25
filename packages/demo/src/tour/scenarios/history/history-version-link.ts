import type { TourScenario } from "../../format.ts";
import { FERRY } from "../documents.ts";
import { setupOf } from "../setup.ts";
import { NOT_PASSING } from "./not-passing.ts";

export const HISTORY_VERSION_LINK: TourScenario = {
  id: "history-version-link",
  group: "History",
  promise:
    "Copy a link to one draft, and it opens as it was for anyone who can read the script.",
  setup: setupOf({ userId: "dana", open: FERRY }, [
    { userId: "sam", open: FERRY },
  ]),
  steps: [
    {
      text: 'Open History and select "Studio draft".',
      highlight: "history_list",
    },
    {
      text: "Choose Copy link in its row menu.",
      highlight: "history.copyLink",
    },
    {
      text: "In Sam's window, paste the link into the address bar.",
      highlight: "page",
    },
  ],
  check:
    'Dana reads "Copied a link to \'Studio draft\'."; Sam\'s window opens the draft read-only, reading "Viewing Studio draft" with "Back to Working".',
  evidence: [
    "Copied a link to 'Studio draft'.",
    "Viewing Studio draft",
    "Back to Working",
  ],
  fresh: false,
  waitsFor: null,
  hidden: NOT_PASSING,
};
