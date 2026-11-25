import type { TourScenario } from "../../format.ts";
import { JUMPOX } from "../documents.ts";

export const HISTORY_CHANGES_PROSE: TourScenario = {
  id: "history-changes-prose",
  group: "History",
  promise: "Changes since a draft work in prose too.",
  setup: {
    userId: "sam",
    open: JUMPOX,
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    {
      text: 'Choose Changes since and pick "First draft".',
      highlight: "history.changesSince",
    },
    { text: "Read the opening of Chapter One.", highlight: "page" },
  ],
  check:
    'The opening paragraph is marked as changed; it now begins "On Tuesdays the bin lorry came down Mallow Street".',
  evidence: ["On Tuesdays the bin lorry came down Mallow Street"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
