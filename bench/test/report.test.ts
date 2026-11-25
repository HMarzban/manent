import { afterAll, expect, test } from "bun:test";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { readBudgets } from "../budgets.ts";
import { BUDGET_MAP } from "../report/budget-map.ts";
import { generateReport } from "../report/generate.ts";
import { readSmokeResults } from "../report/smoke.ts";
import { TRADE_OFFS } from "../report/trade-offs.ts";
import { readResultFile } from "../result.ts";
import type { ResultFile } from "../result.ts";

const bench = join(import.meta.dir, "..");
const fixtures = join(import.meta.dir, "fixtures", "report");
const RUN_NAMES = ["d-modest-1x", "d-modest-4x", "d-small", "failed", "host"];
const FACTS = { comfortLimitPages: 300 };

const trees = createTempTrees("manent-report-");
afterAll(() => trees.removeAll());

type Run = { file: string; result: ResultFile };

async function fixtureRuns(
  names: readonly string[] = RUN_NAMES,
): Promise<Run[]> {
  const runs: Run[] = [];
  for (const name of names)
    runs.push({
      file: `${name}.json`,
      result: await readResultFile(join(fixtures, `${name}.json`)),
    });
  return runs;
}

/** The text of one `## ` section of a report, without its heading. */
function section(report: string, heading: string): string {
  const start = report.indexOf(`\n## ${heading}\n`);
  expect(start).toBeGreaterThan(-1);
  const body = report.slice(start + heading.length + 6);
  const end = body.indexOf("\n## ");
  return end === -1 ? body : body.slice(0, end);
}

const cells = (line: string): string[] =>
  line
    .slice(2, -2)
    .split(" | ")
    .map((cell) => cell.trim());

/** Every Markdown table of a text: its header and its rows, as cells. */
function tables(text: string): { header: string[]; rows: string[][] }[] {
  const found: { header: string[]; rows: string[][] }[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (
      !lines[i]!.startsWith("| ") ||
      !(lines[i + 1] ?? "").startsWith("| ---")
    )
      continue;
    const rows: string[][] = [];
    for (let j = i + 2; (lines[j] ?? "").startsWith("| "); j++)
      rows.push(cells(lines[j]!));
    found.push({ header: cells(lines[i]!), rows });
  }
  return found;
}

/** The Budgets row of `metric`, keyed by column. */
function budgetRow(report: string, metric: string): Record<string, string> {
  const [budgets] = tables(section(report, "Budgets"));
  const row = budgets!.rows.find((r) => r[1] === metric);
  expect(row).toBeArray();
  return Object.fromEntries(budgets!.header.map((h, i) => [h, row![i] ?? ""]));
}

const notMeasuredLines = (report: string): string[] =>
  section(report, "Not measured")
    .split("\n")
    .filter((line) => line.startsWith("- "));

const TYPING = "Keystroke to paint p50 / p95 / p99, at 120 and 2,000 pages";

/** The table "Budgets and where each is held", as published: area, metric, budget, hard fail, remedy. */
const BUDGET_ROWS = [
  [
    "Typing",
    "Keystroke to paint p50 / p95 / p99, at 120 and 2,000 pages",
    "≤ 16 / 33 / 50 ms",
    "> 33 / 50 / 100 ms",
    "Do less on each keystroke: smaller sections, fewer decorations drawn again.",
  ],
  [
    "Typing",
    "Variation across start, middle, end",
    "≤ 20 %",
    "> 50 %",
    "Find the work that grows with the caret's position and keep it inside the caret's section.",
  ],
  [
    "Typing with remote editors",
    "Extra p95 over solo",
    "≤ 8 ms",
    "> 16 ms",
    "Merge more remote changes into each frame's one update.",
  ],
  [
    "Saving",
    'Keystroke to "Saved" p95, web / desktop with full fsync',
    "≤ 100 / 150 ms",
    "> 500 ms",
    "Write the device's changes in fewer, larger batches.",
  ],
  [
    "Pagination",
    "Engine work per keystroke",
    "≤ 0.5 ms",
    "> 2 ms",
    "Repaginate fewer pages after a keystroke.",
  ],
  [
    "Pagination",
    "Total main-thread cost per keystroke",
    "≤ 4 ms",
    "> 8 ms",
    "Move work out of the keystroke's transaction.",
  ],
  [
    "Pagination",
    "Full cold repagination, 120 / 400 / 2,000 pages",
    "≤ 10 / 30 / 150 ms",
    "> 30 / 80 / 400 ms",
    "Paginate the first screen first and the rest in slices.",
  ],
  [
    "Pagination",
    "Frame in which many breaks move",
    "≤ 50 ms",
    "> 100 ms",
    "Spread a whole-script repagination over several frames.",
  ],
  [
    "Open",
    "First editable, warm or offline: 120 / 300 / 2,000 pages",
    "≤ 1.0 / 2.0 / 6.0 s",
    "> 2.0 / 4.0 / 12 s",
    "Make the visible section editable first and load the rest after.",
  ],
  [
    "Paste 50 pages",
    "To next paint",
    "≤ 300 ms",
    "> 1 s",
    "Insert a large paste in slices.",
  ],
  [
    "Scroll",
    "Frame time p95; frames over 50 ms",
    "≤ 16.7 ms; ≤ 1 %",
    "> 33 ms; > 5 %",
    "Skip more of the work for sections off screen.",
  ],
  [
    "Convergence",
    "Update visible elsewhere, p50 / p99",
    "≤ 100 / 500 ms",
    "> 250 ms / > 1 s",
    "Shorten the path from the server to the page: send sooner and apply sooner.",
  ],
  ["Convergence", "Prompter-feed staleness p99", "≤ 1 s", "> 2 s", "—"],
  [
    "Offline merge",
    "Time to converge; longest task",
    "≤ 3 s; ≤ 100 ms",
    "> 10 s; > 500 ms",
    "Merge a long offline session in slices, off the main thread.",
  ],
  [
    "Versions",
    "List of 5,000 interactive; changes between two 120-page versions; restore",
    "≤ 300 ms; ≤ 500 ms; ≤ 1 s",
    "> 1 s; > 2 s; > 3 s",
    "Load the list a page at a time; compare in smaller slices; restore on the server in one step.",
  ],
  [
    "Versions",
    "At 2,000 pages: changes between two versions (no slice over 16 ms); making a version on the serving thread; restore",
    "≤ 4 s (longest slice ≤ 8 ms); ≤ 100 ms; ≤ 3 s",
    "> 10 s (longest slice > 16 ms); > 400 ms; > 8 s",
    "Compare in smaller slices; make versions in the checkpoint worker; restore on the server in one step.",
  ],
  [
    "Export",
    "PDF, 120 pages",
    "≤ 3 s",
    "> 10 s",
    "Write the PDF in slices or in a worker.",
  ],
  [
    "Client memory",
    "Heap for a 120-page / 2,000-page script; growth over a 2-hour soak",
    "≤ 150 / 600 MB; ≤ 10 %",
    "> 400 MB / 1.5 GB; > 30 %",
    "Release what belongs to sections off screen; find what keeps growing.",
  ],
  [
    "Document size",
    "Live bytes ÷ plain text; client IDs",
    "≤ 5x; ≤ 2,000",
    "> 10x; > 10,000 (both trigger a rebuild)",
    "Rebuild the document sooner.",
  ],
  [
    "Server",
    "Fan-out p99 at 200 clients; event-loop lag p99",
    "≤ 50 ms; ≤ 20 ms",
    "> 200 ms; > 100 ms",
    "Encode each update once for every recipient; move heavy work to the checkpoint worker.",
  ],
  [
    "Server",
    "Memory per idle room; per loaded 120-page room",
    "0; ≤ 20 MB",
    "any; > 60 MB",
    "Unload idle rooms sooner and keep less in each loaded room.",
  ],
  [
    "Server",
    "Join storm, 200 clients, last synced",
    "≤ 3 s",
    "> 10 s",
    "Encode a room's state once for every client that joins.",
  ],
  [
    "Storage",
    "Growth per typist-hour (14,400 single-keystroke pushes; the log is kept until a rebuild); checkpoint stall on the serving thread",
    "≤ 1 MB; 0 ms",
    "> 2 MB; > 20 ms",
    "Store smaller log rows; keep checkpoint writes in the worker.",
  ],
  [
    "Storage",
    "Serving-thread stall of one rebuild of a 2,000-page script, and of a replay whose base is built from a long log (p99)",
    "≤ 20 ms",
    "> 100 ms",
    "Move the rebuild and the replay to the checkpoint worker.",
  ],
  [
    "Durability",
    "Acknowledged updates lost across 200 kills",
    "0",
    "any",
    "Find the lost update and make its write durable before its acknowledgement.",
  ],
  [
    "Size",
    "First-load web JavaScript (gzip); desktop installer",
    "≤ 350 KB; ≤ 250 MB",
    "> 600 KB; > 400 MB",
    "Load less code before the first screen; leave out of the installer what the app does not use.",
  ],
  [
    "Desktop",
    "Cold start, launch to the first frame; idle memory of all the app's processes, 30 s after the first frame",
    "≤ 2.0 s; ≤ 400 MB",
    "> 4.0 s; > 700 MB",
    "Start less before the first frame; find which process holds the memory.",
  ],
  [
    "Demo",
    "Seeding Small and Medium before the app opens; seeding Lanternfield Studios in the background, reference Mac",
    "≤ 30 s; ≤ 10 min",
    "> 60 s; > 20 min",
    "Seed less before the app opens and more in the background.",
  ],
  [
    "Interface",
    "Store writes outside the facts, and React commits not caused by a changed fact, per keystroke",
    "0",
    "any",
    "Find the write and move it behind a changed fact.",
  ],
  [
    "Interface",
    "Interaction to next paint outside the page",
    "≤ 100 ms",
    "> 200 ms",
    "Split the work of the slow handler across frames.",
  ],
  [
    "Interface",
    "Open a menu, popover or the palette",
    "≤ 50 ms",
    "> 100 ms",
    "Render the popup's content before it is opened.",
  ],
  [
    "Interface",
    "Open or close a loaded panel; open a dialog",
    "≤ 100 ms",
    "> 200 ms",
    "Keep loaded panels mounted and hidden.",
  ],
  [
    "Interface",
    "Change screen (frame painted); open Preferences",
    "≤ 150 ms",
    "> 300 ms",
    "Load each screen's code before it is opened.",
  ],
  [
    "Interface",
    "A preference or setting takes effect (attribute; theme at 2,000 pages)",
    "≤ 50 ms; ≤ 100 ms",
    "> 100 ms; > 200 ms",
    "Change one attribute and let the stylesheet do the rest.",
  ],
  [
    "Interface",
    "Switch person",
    "≤ 500 ms",
    "> 1 s",
    "Keep the next person's data ready before the switch.",
  ],
  [
    "Interface",
    "Start-up: the static frame replaced by the real one",
    "≤ 150 ms",
    "> 300 ms",
    "Load less before the first real frame.",
  ],
  [
    "Interface",
    "Vertical movement of the caret's line when a panel opens; when a remote edit lands above",
    "0 px; ≤ 1 px",
    "> 1 px",
    "Hold the caret's line in place when the layout above it changes.",
  ],
  [
    "Interface",
    "Entry chunk; any other interface chunk except data and editor (gzip)",
    "≤ 150 KB; ≤ 60 KB",
    "> 250 KB; > 120 KB",
    "Split the chunk and load the parts when they are used.",
  ],
  [
    "Interface",
    "Facts and outline published per keystroke; the palette's search",
    "≤ 0.5 ms; ≤ 50 ms",
    "> 1 ms; > 150 ms",
    "Publish only the facts that changed; search a prepared index.",
  ],
  [
    "Server",
    "One keystroke through the write path, 120 / 2,000 pages",
    "≤ 2 ms",
    "> 20 ms",
    "Do less in the write path before the acknowledgement.",
  ],
  [
    "Server",
    "Memory growth over the 8-hour soak; every bot holding the same text at its end",
    "≤ 10 %; 0",
    "> 30 %; > 0",
    "Find what the server keeps for a connection after it closes; find the update one bot never received.",
  ],
  [
    "Production",
    "Revision marks per keystroke, 120 pages with 12 revisions",
    "≤ 0.5 ms",
    "> 2 ms",
    "Derive marks for the visible pages only.",
  ],
];

const TRADE_OFF_20 = {
  number: 20,
  tradeOff: "Heavy work on the serving thread",
  gain: "One process, no worker protocol for the rarer jobs",
  cost: "A rebuild of a 2,000-page script, a replay whose base is rebuilt from a long log, making a version of a long script, and drawing an issued PDF run inline and can stall other documents; each moves to the checkpoint worker if the benchmark shows a stall over 20 ms",
};

test("the report is reproduced exactly from fixed result files", async () => {
  expect(generateReport(await fixtureRuns(), [], FACTS)).toBe(
    await Bun.file(join(fixtures, "expected.md")).text(),
  );
});

test("the same results give the same report, whatever their order on disk", async () => {
  const runs = await fixtureRuns();
  const report = generateReport(runs, [], FACTS);
  expect(generateReport(runs.toReversed(), [], FACTS)).toBe(report);
  expect(
    generateReport([...runs.slice(2), ...runs.slice(0, 2)], [], FACTS),
  ).toBe(report);
  expect(
    generateReport(
      runs.map((r) => ({ ...r, file: join("somewhere", "else", r.file) })),
      [],
      FACTS,
    ),
  ).toBe(report);
});

test("a host number is never shown without the modest-tier number beside it", async () => {
  const report = generateReport(
    await fixtureRuns(),
    await readSmokeResults(fixtures),
    FACTS,
  );
  let hostCells = 0;
  for (const { header, rows } of tables(report)) {
    const host = header.indexOf("host");
    if (host === -1) continue;
    const modest = header.indexOf("D-modest");
    expect(modest).toBeGreaterThan(-1);
    for (const row of rows) {
      if (row[host] === "") continue;
      hostCells++;
      expect(row[modest]).not.toBe("");
    }
  }
  expect(hostCells).toBeGreaterThan(10);
  const withoutModest = generateReport(
    await fixtureRuns(RUN_NAMES.filter((n) => n !== "d-modest-1x")),
    [],
    FACTS,
  );
  expect(
    tables(withoutModest).filter((t) => t.header.includes("host")),
  ).toEqual([]);
  expect(tables(report).filter((t) => t.header.includes("host")).length).toBe(
    4,
  );
});

test("every row of the budgets file is shown in the report", async () => {
  const { budgets } = await readBudgets(bench, "D-modest");
  const held = BUDGET_MAP.map((r) =>
    r.held.type === "scenarios" ? r.held.budgets : [],
  );
  expect(budgets.length).toBe(96);
  for (const row of budgets)
    expect([
      row,
      held.filter((list) => list.some((b) => Bun.deepEquals(b, row))).length,
    ]).toEqual([row, 1]);
  expect(held.flat().length).toBe(budgets.length);
});

test("every budget has a row in the report", () => {
  expect(
    BUDGET_MAP.map((r) => [r.area, r.metric, r.budget, r.hardFail, r.remedy]),
  ).toEqual(BUDGET_ROWS);
});

test("every scenario that did not measure is listed with its reason", async () => {
  const report = generateReport(await fixtureRuns(["failed"]), [], FACTS);
  expect(
    notMeasuredLines(report).filter((line) => line.includes(" on D-typical: ")),
  ).toEqual([
    "- export.pdf-120 on D-typical: could not finish: export.pdf-120 pdf_ms was budgeted and not measured.",
    "- crdt.traces on D-typical: the editing traces are not fetched: run bun run bench fetch-traces.",
    "- typing-120 on D-typical: the machine was not quiet: load 3.4, calibration spread 1.6.",
  ]);
});

test("an undecided result never reads as a pass", async () => {
  const runs = await fixtureRuns();
  const report = generateReport(runs, [], FACTS);
  expect(
    budgetRow(report, "Total main-thread cost per keystroke").Verdict,
  ).toBe("undecided — too few samples");
  const [envelope] = tables(section(report, "Comfort envelope"));
  const typing1000 = envelope!.rows.find((r) => r[0] === "typing-1000")!;
  expect(typing1000[envelope!.header.indexOf("D-modest 4x")]).toBe(
    "80.0 ms (62.0–99.0) undecided",
  );
  const constant = structuredClone(runs);
  const typing120 = constant[0]!.result.scenarios.find(
    (s) => s.id === "typing-120",
  );
  if (typing120?.outcome !== "measured")
    throw new Error("the fixture's typing-120 is measured");
  for (const m of typing120.metrics)
    if (m.metric === "keystroke_paint")
      Object.assign(m, { verdict: "inconclusive", verdictReason: "constant" });
  const typing = budgetRow(generateReport(constant, [], FACTS), TYPING);
  expect(typing.Verdict).toBe("hard fail");
  const variation = structuredClone(runs);
  const spread = variation[0]!.result.scenarios.find(
    (s) => s.id === "typing-120",
  );
  if (spread?.outcome !== "measured")
    throw new Error("the fixture's typing-120 is measured");
  for (const m of spread.metrics)
    if (m.metric === "position_spread")
      Object.assign(m, { verdict: "inconclusive", verdictReason: "constant" });
  expect(
    budgetRow(
      generateReport(variation, [], FACTS),
      "Variation across start, middle, end",
    ).Verdict,
  ).toBe("undecided — every sample was equal");
});

test("a failing budget is shown as failing, in the budget table and the summary", async () => {
  const report = generateReport(await fixtureRuns(), [], FACTS);
  const budgets = section(report, "Budgets").split("\n\n");
  expect(budgets.slice(0, 2)).toEqual([
    "39 budgets: 2 pass, 1 over budget, 1 hard fail, 1 undecided, 34 not measured",
    `Hard fails: Typing — ${TYPING}.`,
  ]);
  expect(budgetRow(report, TYPING).Verdict).toBe("hard fail");
  expect(
    budgetRow(
      report,
      "First editable, warm or offline: 120 / 300 / 2,000 pages",
    ).Verdict,
  ).toBe("over budget");
});

test("every trade-off is in the report, in its published words", () => {
  expect(TRADE_OFFS.map((t) => t.number)).toEqual(
    Array.from({ length: 28 }, (_, i) => i + 1),
  );
  expect(TRADE_OFFS[19]).toEqual(TRADE_OFF_20);
});

test("a reader can rerun every row", async () => {
  const runs = await fixtureRuns();
  const report = generateReport(runs, [], FACTS);
  const [budgets] = tables(section(report, "Budgets"));
  const measuredBy = budgets!.header.indexOf("Measured by");
  const tiers = ["D-modest", "D-modest 4x", "D-typical", "D-small", "host"].map(
    (t) => budgets!.header.indexOf(t),
  );
  let values = 0;
  for (const row of budgets!.rows)
    for (const column of tiers)
      for (const entry of (row[column] ?? "").split("<br>")) {
        const [, scenario] =
          /^(\S+) \S+ \S+: (?!not measured)/.exec(entry) ?? [];
        if (scenario === undefined) continue;
        values++;
        expect(row[measuredBy]).toMatch(
          new RegExp(
            `(^|<br>)${scenario.replaceAll(".", "\\.")} on (D-modest|D-small|host)(<br>|$)`,
          ),
        );
      }
  expect(values).toBeGreaterThan(20);
  const method = section(report, "What was measured, and how");
  const dockerfile = await Bun.file(join(bench, "tiers", "Dockerfile")).text();
  const images = [/^FROM (\S+)$/m, /^COPY --from=(\S+) /m].map(
    (p) => p.exec(dockerfile)?.[1] ?? "no image",
  );
  for (const text of [
    runs[0]!.result.environment.commit,
    ...runs.map((r) => r.result.environment.command),
    ...images,
    "Corpus version 1;",
  ])
    expect([text, method.includes(text)]).toEqual([text, true]);
});

test("smoke results are read field by field and a broken one is refused", async () => {
  expect(await readSmokeResults(fixtures)).toEqual([
    {
      platform: "darwin",
      version: "0.1.0",
      firstFrameMs: 640,
      coldStartMs: 1480,
      idleRssBytes: 352000000,
      coldStart: "within",
      idleMemory: "within",
      saved: true,
      synced: true,
      secondInstanceDeferred: true,
      offlineSaved: true,
      updatedWithOutbox: null,
      noticesBeside: true,
    },
  ]);
  const smoke: Record<string, unknown> = JSON.parse(
    await Bun.file(join(fixtures, "desktop-smoke-darwin.json")).text(),
  );
  delete smoke.saved;
  const dir = await trees.tree({
    "desktop-smoke-linux.json": JSON.stringify(smoke),
  });
  const path = join(dir, "desktop-smoke-linux.json");
  expect(readSmokeResults(dir)).rejects.toThrow(
    `${path}: saved must be true or false, not undefined`,
  );
  expect(await readSmokeResults(join(dir, "absent"))).toEqual([]);
});

test("the report names no hardware model and no private path", async () => {
  const report = generateReport(
    await fixtureRuns(),
    await readSmokeResults(fixtures),
    FACTS,
  );
  const forbidden = [
    /§/,
    /\bsections?\s+\d/i,
    /\bthe design\b/i,
    /\bthe spec\b/i,
    /\b(?:plan|task|spike)\s+#?\d/i,
    /\/Users\//,
    /\/home\//,
    /\b(?:Apple M\d|Intel|AMD|Ryzen|Xeon|Core i\d)\b/,
  ];
  expect(forbidden.filter((p) => p.test(report))).toEqual([]);
  expect(report.includes("runner/work")).toBe(false);
});

test("a tier that could not run is listed with its reason", async () => {
  const report = generateReport(await fixtureRuns(), [], FACTS);
  const docker =
    "Docker is not running, so the Docker tiers are recorded as not measured. Start Docker and run bun run bench again to measure them.";
  expect(
    notMeasuredLines(report).filter((line) => line.includes(" on D-small: ")),
  ).toEqual([
    `- server.fanout on D-small: ${docker}`,
    `- server.join-storm on D-small: ${docker}`,
  ]);
  for (const metric of [
    "Fan-out p99 at 200 clients; event-loop lag p99",
    "Join storm, 200 clients, last synced",
  ]) {
    const row = budgetRow(report, metric);
    expect([row["D-small"], row.Verdict]).toEqual([
      "not measured",
      "not measured",
    ]);
  }
});

test("a failing row names its remedy", async () => {
  const report = generateReport(await fixtureRuns(), [], FACTS);
  expect(budgetRow(report, TYPING).Remedy).toBe(BUDGET_MAP[0]!.remedy);
  expect(
    budgetRow(report, "Variation across start, middle, end"),
  ).toMatchObject({ Verdict: "pass", Remedy: "" });
});
