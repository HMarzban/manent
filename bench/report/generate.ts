// The benchmark report, generated from result files: the same files give the same bytes, whatever
// their order.

import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { PROFILES, PROFILE_IDS } from "@manent/demo";
import { TRACE_SOURCES } from "../corpus/traces.ts";
import { readResultFile } from "../result.ts";
import type { ResultFile } from "../result.ts";
import { TIERS, TIER_IDS } from "../tiers/tiers.ts";
import { breaksSection } from "./breaks.ts";
import { budgetsSection } from "./budget-map.ts";
import { readComfortLimit } from "./comfort-limit.ts";
import { blocksOf, comfortLimits, envelopeSection } from "./envelope.ts";
import {
  COLUMNS,
  byText,
  NOT_MEASURED,
  columnsOf,
  formatBytes,
  formatCount,
  formatMs,
  labelOf,
  plural,
  statCell,
  table,
} from "./format.ts";
import type { Run } from "./format.ts";
import { notMeasuredSection } from "./not-built.ts";
import { readSmokeResults } from "./smoke.ts";
import type { SmokeResult } from "./smoke.ts";
import {
  LIMITS,
  LONG_BOOK,
  METHOD,
  MODE_SIZES,
  NOT_RECORDED,
  NO_PROOF,
  QUIET,
  RERUN,
  SECTIONS,
  STATISTICS,
  TITLE,
  WORKLOADS,
  WRONG_DESIGN,
  comfortNotice,
  corpus,
  limitsFirst,
  proofRun,
  software,
} from "./text.ts";
import { tradeOffsSection } from "./trade-offs.ts";

const MODES = ["quick", "standard", "full"] as const;

/** Where a run's tier and slowdown come in column order; a tier with no column comes after them all. */
function columnIndex(run: Run): number {
  const { tier, throttle } = run.result.environment;
  const i = COLUMNS.findIndex(
    (c) => c.tier === tier && c.throttle === throttle,
  );
  return i === -1 ? COLUMNS.length + TIER_IDS.indexOf(tier) : i;
}

/** Column order, then the oldest first, then by name. */
function runOrder(a: Run, b: Run): number {
  return (
    columnIndex(a) - columnIndex(b) ||
    a.result.startedAt - b.result.startedAt ||
    byText(a.file, b.file)
  );
}

const distinct = (items: readonly string[]): string[] => [...new Set(items)];
const numbered = (items: readonly string[]): string =>
  items.map((item, i) => `${i + 1}. ${item}`).join("\n");

function runsTable(runs: readonly Run[]): string {
  return table(
    ["Run", "Tier", "Mode", "Commit", "Tree", "Elapsed"],
    runs.map(({ file, result: { environment: e, startedAt, finishedAt } }) => [
      file,
      labelOf(e),
      e.prove ? `${e.mode}, proof` : e.mode,
      e.commit,
      e.dirty ? "uncommitted changes" : "clean",
      `${formatMs(finishedAt - startedAt)} ms`,
    ]),
  );
}

function limitsText(limits: {
  cpus: number | null;
  memoryBytes: number | null;
}): string {
  if (limits.cpus === null && limits.memoryBytes === null) return "no limits";
  const cpus =
    limits.cpus === null
      ? "no processor limit"
      : `${plural(limits.cpus, "processor", "processors")}`;
  const memory =
    limits.memoryBytes === null
      ? "no memory limit"
      : formatBytes(limits.memoryBytes);
  return `limits ${cpus}, ${memory}`;
}

function tiersTable(runs: readonly Run[]): string {
  return table(
    ["Tier", "Stands for", "Processors", "Memory", "Slowdowns", "Recorded"],
    TIER_IDS.map((id) => {
      const tier = TIERS[id];
      const recorded = runs
        .filter((r) => r.result.environment.tier === id)
        .map(
          ({ result: { environment: e } }) =>
            `${labelOf(e)}: ${limitsText(e.limits)}; sees ${plural(e.cpus, "core", "cores")}, ${formatBytes(e.memoryBytes)}, ${e.platform} ${e.arch}`,
        );
      return [
        id,
        tier.standsFor,
        tier.cpus === null ? "uncapped" : formatCount(tier.cpus),
        tier.memoryBytes === null ? "uncapped" : formatBytes(tier.memoryBytes),
        tier.throttles.map((t) => `${t}x`).join(", "),
        distinct(recorded).join("<br>"),
      ];
    }),
  );
}

const range = ([lo, hi]: readonly [number, number]): string =>
  lo === 0 && hi === 0 ? "—" : `${formatCount(lo)}–${formatCount(hi)}`;

function profilesTable(): string {
  return table(
    [
      "Profile",
      "Keystrokes a second",
      "Burst characters",
      "Pause (ms)",
      "Scene moves an hour",
      "Pastes an hour",
      "Paste pages",
      "Offline an hour",
      "Offline (ms)",
      "Presence",
    ],
    PROFILE_IDS.map((id) => {
      const p = PROFILES[id];
      return [
        id,
        formatCount(p.keysPerSecond),
        range(p.burstChars),
        range(p.pauseMs),
        formatCount(p.sceneMovesPerHour),
        formatCount(p.pastesPerHour),
        range(p.pastePages),
        formatCount(p.offlinePerHour),
        range(p.offlineMs),
        p.presence ? "yes" : "no",
      ];
    }),
  );
}

function modeSizesTable(runs: readonly Run[]): string {
  const used = MODES.filter((m) =>
    runs.some((r) => r.result.environment.mode === m),
  );
  return table(
    ["", ...used],
    MODE_SIZES.map(([label, ...values]) => [
      label,
      ...used.map((m) => values[MODES.indexOf(m)] ?? ""),
    ]),
  );
}

function proofText(runs: readonly Run[]): string {
  const proofs = runs.filter((r) => r.result.environment.prove);
  if (proofs.length === 0) return NO_PROOF;
  return proofs
    .map(({ file, result }) =>
      proofRun(
        file,
        result.unproved.map((r) => `${r.scenario} ${r.metric}`),
      ),
    )
    .join("\n\n");
}

const versions = (list: readonly string[]): string =>
  list.length === 0 ? NOT_RECORDED : list.join(", ");

function methodSection(runs: readonly Run[]): string {
  const environments = runs.map((r) => r.result.environment);
  const chromium = distinct(
    environments.flatMap((e) => (e.chromium === null ? [] : [e.chromium])),
  );
  return [
    METHOD,
    runsTable(runs),
    ["```text", ...distinct(environments.map((e) => e.command)), "```"].join(
      "\n",
    ),
    software({
      bun: versions(distinct(environments.map((e) => e.bun))),
      chromium: versions(chromium),
    }),
    tiersTable(runs),
    corpus(
      distinct(environments.map((e) => formatCount(e.corpusVersion))).join(
        ", ",
      ),
    ),
    table(
      ["Trace", "SHA-256", "Credit"],
      TRACE_SOURCES.map((t) => [t.name, t.sha256, t.credit]),
    ),
    table(["Workload", "Stands for", "What is measured here"], WORKLOADS),
    profilesTable(),
    modeSizesTable(runs),
    STATISTICS,
    QUIET,
    proofText(runs),
    RERUN,
  ].join("\n\n");
}

function wrongDesignSection(runs: readonly Run[]): string {
  const typing = columnsOf(runs, ["client"]);
  const crdt = columnsOf(runs, ["crdt"]);
  const keystrokes = ["typing-flat-1000", "typing-1000"].map((id) => [
    id,
    ...typing.map((c) =>
      statCell(runs, c, {
        scenario: id,
        metric: "keystroke_paint",
        stat: "p95",
      }),
    ),
  ]);
  const ratios = ["bytes_ratio_reused", "bytes_ratio_fresh"].map((metric) => [
    `crdt.daily-reuse ${metric}`,
    ...crdt.map((c) =>
      statCell(runs, c, { scenario: "crdt.daily-reuse", metric, stat: "max" }),
    ),
  ]);
  return [
    WRONG_DESIGN,
    table(["Scenario", ...typing.map((c) => c.label)], keystrokes),
    table(["Scenario", ...crdt.map((c) => c.label)], ratios),
  ].join("\n\n");
}

function longBookSection(runs: readonly Run[]): string {
  const columns = columnsOf(runs, ["client"]);
  const ids = [
    "typing-book-1000",
    "typing-1000",
    "typing-book-2000",
    "typing-2000",
  ];
  const rows = ids.map((id) => {
    const blocks =
      columns.map((c) => blocksOf(runs, c, id)).find((b) => b !== null) ?? null;
    return [
      id,
      blocks === null ? NOT_MEASURED : formatCount(blocks),
      NOT_MEASURED,
      ...columns.map((c) =>
        statCell(runs, c, {
          scenario: id,
          metric: "keystroke_paint",
          stat: "p95",
        }),
      ),
    ];
  });
  return [
    LONG_BOOK,
    table(
      ["Scenario", "Blocks", "Characters", ...columns.map((c) => c.label)],
      rows,
    ),
  ].join("\n\n");
}

function rawDataSection(runs: readonly Run[]): string {
  return distinct(runs.map((r) => r.file).toSorted())
    .map((name) => `- [${name}](runs/${name})`)
    .join("\n");
}

/** The report of `runs`, the desktop smoke results and the app's comfort limit. Pure: the same inputs give the same bytes. */
export function generateReport(
  runs: readonly { file: string; result: ResultFile }[],
  smoke: readonly SmokeResult[],
  facts: { comfortLimitPages: number },
): string {
  const ordered = runs
    .map((r) => ({ file: basename(r.file), result: r.result }))
    .toSorted(runOrder);
  const systems = smoke.toSorted((a, b) =>
    a.platform < b.platform ? -1 : a.platform > b.platform ? 1 : 0,
  );
  const limits = comfortLimits(ordered);
  const sections: [string, string][] = [
    [SECTIONS.method, methodSection(ordered)],
    [SECTIONS.limits, numbered(LIMITS)],
    [SECTIONS.limitsFirst, numbered(limitsFirst(limits))],
    [SECTIONS.budgets, budgetsSection(ordered, systems)],
    [SECTIONS.envelope, envelopeSection(ordered)],
    [
      SECTIONS.pastComfort,
      comfortNotice(formatCount(facts.comfortLimitPages), limits),
    ],
    [SECTIONS.breaks, breaksSection(ordered)],
    [SECTIONS.wrongDesign, wrongDesignSection(ordered)],
    [SECTIONS.longBook, longBookSection(ordered)],
    [SECTIONS.tradeOffs, tradeOffsSection(ordered)],
    [SECTIONS.notMeasured, notMeasuredSection(ordered, systems)],
    [SECTIONS.rawData, rawDataSection(ordered)],
  ];
  return `${[TITLE, ...sections.map(([heading, body]) => `## ${heading}\n\n${body}`)].join("\n\n")}\n`;
}

const BENCH = join(import.meta.dir, "..");

/** The result files directly in `dir`, by name. */
export async function resultFilesIn(dir: string): Promise<string[]> {
  return (await readdir(dir))
    .filter((name) => name.endsWith(".json"))
    .toSorted()
    .map((name) => join(dir, name));
}

/** The report of the result files at `paths`, with the desktop smoke files in `smokeDir` and the app's comfort limit. */
export async function reportOf(
  paths: readonly string[],
  smokeDir: string = join(BENCH, "results", "desktop"),
): Promise<string> {
  const runs = [];
  for (const file of paths)
    runs.push({ file, result: await readResultFile(file) });
  return generateReport(runs, await readSmokeResults(smokeDir), {
    comfortLimitPages: await readComfortLimit(join(BENCH, "..")),
  });
}
