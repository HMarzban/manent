import { expect, test } from "bun:test";
import { join } from "node:path";
import { readBudgets } from "../budgets.ts";

const SUITE_SCENARIOS = [
  "typing-book-2000",
  "typing-boundary-2000",
  "locked-120",
  "open-120",
  "open-300",
  "open-2000",
  "scroll-120",
  "scroll-2000",
  "repaginate-120",
  "repaginate-2000",
  "saved-web-120",
  "interface-2000",
  "export.pdf-120",
  "crowd-120",
  "convergence-120",
  "merge-offline-120",
  "merge-offline-book-2000",
  "soak-client-120",
  "crdt.aged",
  "desktop.saved-fsync",
];

const EXPECTED = [
  ["typing-book-2000", "keystroke_paint", "p50", 16, 33],
  ["typing-book-2000", "keystroke_paint", "p95", 33, 50],
  ["typing-book-2000", "keystroke_paint", "p99", 50, 100],
  ["typing-boundary-2000", "keystroke_paint", "p50", 16, 33],
  ["typing-boundary-2000", "keystroke_paint", "p95", 33, 50],
  ["typing-boundary-2000", "keystroke_paint", "p99", 50, 100],
  ["locked-120", "keystroke_paint", "p50", 16, 33],
  ["locked-120", "keystroke_paint", "p95", 33, 50],
  ["locked-120", "keystroke_paint", "p99", 50, 100],
  ["open-120", "first_editable_warm", "p95", 1000, 2000],
  ["open-120", "first_editable_offline", "p95", 1000, 2000],
  ["open-300", "first_editable_warm", "p95", 2000, 4000],
  ["open-300", "first_editable_offline", "p95", 2000, 4000],
  ["open-2000", "first_editable_warm", "p95", 6000, 12000],
  ["open-2000", "first_editable_offline", "p95", 6000, 12000],
  ["open-120", "heap_bytes", "p95", 150000000, 400000000],
  ["open-2000", "heap_bytes", "p95", 600000000, 1500000000],
  ["scroll-120", "frame_ms", "p95", 16.7, 33],
  ["scroll-120", "frames_over_50", "max", 1, 5],
  ["scroll-2000", "frame_ms", "p95", 16.7, 33],
  ["scroll-2000", "frames_over_50", "max", 1, 5],
  ["repaginate-120", "breaks_frame_ms", "p95", 50, 100],
  ["repaginate-2000", "breaks_frame_ms", "p95", 50, 100],
  ["saved-web-120", "keystroke_saved", "p95", 100, 500],
  ["interface-2000", "theme_apply_ms", "p95", 100, 200],
  ["interface-2000", "inp_outside_ms", "p95", 100, 200],
  ["export.pdf-120", "pdf_ms", "p95", 3000, 10000],
  ["crowd-120", "remote_extra_realistic", "max", 8, 16],
  ["convergence-120", "visible_ms", "p50", 100, 250],
  ["convergence-120", "visible_ms", "p99", 500, 1000],
  ["merge-offline-120", "converge_ms", "max", 3000, 10000],
  ["merge-offline-120", "longest_task_ms", "p95", 100, 500],
  ["merge-offline-book-2000", "converge_ms", "max", 3000, 10000],
  ["merge-offline-book-2000", "longest_task_ms", "p95", 100, 500],
  ["soak-client-120", "heap_growth", "max", 10, 30],
  ["crdt.aged", "bytes_ratio_400", "max", 5, 10],
  ["crdt.aged", "client_ids_400", "max", 2000, 10000],
  ["desktop.saved-fsync", "keystroke_saved", "p95", 150, 500],
];

test("the suite's own budget rows are the agreed ones", async () => {
  const rows = (
    await readBudgets(join(import.meta.dir, ".."), "D-modest")
  ).budgets.filter((b) => SUITE_SCENARIOS.includes(b.scenario));
  expect(
    rows.map((b) => [b.scenario, b.metric, b.stat, b.budget, b.hardFail]),
  ).toEqual(EXPECTED);
});
