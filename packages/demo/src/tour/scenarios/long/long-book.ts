import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";

export const LONG_BOOK: TourScenario = {
  id: "long-book",
  group: "Long documents",
  promise: "A 291-page book scrolls smoothly and every chapter starts a page.",
  setup: {
    userId: "sam",
    open: docPath("small/jumpox/manuscript"),
    extraWindows: [],
    prepare: null,
    shell: "any",
  },
  steps: [
    { text: "Scroll through the book.", highlight: "page" },
    { text: "The readout keeps your place.", highlight: "status:page" },
  ],
  check: 'The readout reads "Page 1 of 291" at the start.',
  evidence: ["Page 1 of 291"],
  fresh: false,
  waitsFor: null,
  hidden: null,
};
