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
    prepare: null,
    shell: "any",
  },
  steps: [
    { text: "Duplicate 203, then lock the copy.", highlight: "page" },
    { text: "Open 203 again: it is not locked.", highlight: "page" },
  ],
  check:
    'The copy reads "Page numbers and scene numbers are locked. Changes are now marked Blue."; 203 is as it was.',
  evidence: [
    "Page numbers and scene numbers are locked. Changes are now marked Blue.",
  ],
  fresh: false,
  waitsFor: "copy_script",
  hidden: null,
};
