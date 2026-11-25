import type { TourScenario } from "../../format.ts";
import { UNDERTOW } from "../documents.ts";

export const PRODUCTION_LOCK_COPY: TourScenario = {
  id: "production-lock-copy",
  group: "Production",
  promise: "Try a lock on a copy first, and keep the original as it is.",
  setup: {
    userId: "priya",
    open: UNDERTOW,
    extraWindows: [],
    prepare: "undertow-unlocked",
    shell: "any",
  },
  steps: [
    { text: "Choose Lock for production…", highlight: "production.lock" },
    { text: "Choose Try it on a copy first.", highlight: "lock:copy" },
    {
      text: "Choose Open beside in the message.",
      highlight: "copy.openCopyBeside",
    },
  ],
  check:
    "The message reads \"Made a copy, '203 Undertow — copy', and locked its page numbers. The original is unchanged.\"; 203 shows no revision in its state bar.",
  evidence: [
    "Made a copy, '203 Undertow — copy', and locked its page numbers. The original is unchanged.",
  ],
  fresh: true,
  waitsFor: null,
  hidden: "its end-to-end test does not pass yet",
};
