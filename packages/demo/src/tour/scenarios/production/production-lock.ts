import type { TourScenario } from "../../format.ts";
import { UNDERTOW } from "../documents.ts";

export const PRODUCTION_LOCK: TourScenario = {
  id: "production-lock",
  group: "Production",
  promise: "Lock page numbers for production.",
  setup: {
    userId: "priya",
    open: UNDERTOW,
    extraWindows: [],
    prepare: "undertow-unlocked",
    shell: "any",
  },
  steps: [
    { text: "Choose Lock for production…", highlight: "production.lock" },
    {
      text: "Read what it does, then choose Lock for production.",
      highlight: "lock:confirm",
    },
  ],
  check:
    'The message reads "Page numbers and scene numbers are locked. Changes are now marked Blue." and the state bar shows Blue; 203 stays locked until the demo is reset.',
  evidence: [
    "Page numbers and scene numbers are locked. Changes are now marked Blue.",
  ],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
