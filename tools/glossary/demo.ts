// The demo's own words.
import type { Term } from "./index.ts";
import { row } from "./row.ts";

export const DEMO_TERMS: readonly Term[] = Object.freeze([
  ...row(
    "demo",
    [
      "Choose who you are",
      "Chosen",
      "Demo bar",
      "Person",
      "Connection",
      "Online",
      "Slow",
      "Add writers",
      "Stop writers",
      "Stop the server",
      "Timings",
      "Keystroke to frame",
      "Pagination time",
      "Sync round trip",
      "p50",
      "p95",
      "samples",
      "Reorganise",
      "Reset",
      "Tour",
      "Set it up",
      "What to check",
    ],
    [],
  ),
]);
