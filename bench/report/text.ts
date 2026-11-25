// The report's fixed sentences and the templates its other lines are filled from.

export const TITLE = "# Benchmark report";

export const SECTIONS = {
  method: "What was measured, and how",
  limits: "Limits of the method",
  limitsFirst: "Limits to state first",
  budgets: "Budgets",
  envelope: "Comfort envelope",
  pastComfort: "Past the comfortable length",
  breaks: "Where it breaks",
  wrongDesign: "The wrong design, on purpose",
  longBook: "The long book",
  tradeOffs: "Trade-offs",
  notMeasured: "Not measured",
  rawData: "Raw data",
} as const;

export const METHOD =
  "Every number in this report was read from a result file under runs/, written by the benchmark suite in this repository at the commit named below. Each scenario ran in fresh processes, and the samples of all its processes were pooled. Timings are reported as nearest-rank percentiles (p50, p95, p99) with a bootstrap interval of the percentile (1,000 resamples, seed 4747); no mean and no best run is reported.";

export const STATISTICS =
  "A budget is met only when the whole interval lies at or under it, and missed only when the whole interval lies over it; an interval that crosses a limit is undecided. A percentile is decided only over enough samples: 10 for p50, 40 for p95 and 200 for p99, and for keystrokes and frames at least 200 kept in each process, after the first tenth of each process's samples (at least 20) is dropped as warm-up. A timing budget needs at least five processes. A figure with one value per process, a size and a count are compared directly with their limit. A budget is judged only on the tier named for it, at 1x and outside a quick run; every other run is reported and not judged.";

export const QUIET =
  "Before each scenario the runner checked that the machine was quiet: a one-minute load average at or under a quarter of the cores it sees (at least 1), and a fixed calibration loop whose 90th-percentile time was at most 1.25 times its 10th. It checked every 5 seconds for up to one minute; a scenario that never found the machine quiet is reported as void, with what the check saw.";

export const RERUN =
  "To run one row again, check out the commit, run bun install --frozen-lockfile, then bun run bench fetch-traces (for the editing traces) and bun run bench --tier <tier> --filter <scenario>. Docker must be running for every tier but host; the tiers are containers with the limits in the table above, built from the two base images named above.";

/** The two base images of the tier containers, as the tier image's build names them. */
const BASE_IMAGES = [
  "mcr.microsoft.com/playwright:v1.65.1-noble",
  "oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d",
] as const;
const PLAYWRIGHT_VERSION = "1.65.1";

export const NOT_RECORDED = "not recorded";

export const software = (versions: { bun: string; chromium: string }): string =>
  `Bun ${versions.bun}; Chromium ${versions.chromium}; Playwright ${PLAYWRIGHT_VERSION}. Base images: ${BASE_IMAGES.join(" and ")}.`;

export const corpus = (version: string): string =>
  `Corpus version ${version}; each scenario generates its documents from a fixed seed named in its file, and the editing traces are:`;

export const NO_PROOF = "No proof run was published.";

/** A published proof run, and the rows it did not prove. */
export function proofRun(file: string, unproved: readonly string[]): string {
  return unproved.length === 0
    ? `Proof run ${file}: every row it ran was proved, but for the rows listed under Not measured.`
    : `Proof run ${file}: it did not prove ${unproved.join(", ")}, whose samples do not pass through the shared measuring path.`;
}

export const WORKLOADS: readonly (readonly [string, string, string])[] = [
  [
    "W1",
    "A feature film in production",
    "a 120-page script, aged by 400 editing sessions where a row says so, with up to 3 simulated writers and 10 readers",
  ],
  [
    "W3",
    "A night of rewrites",
    "one fast typist and two other writers in one script",
  ],
  [
    "W6",
    "The wrong design, on purpose",
    "a 1,000-page script in a single section, with one typist",
  ],
  [
    "W7",
    "A long book",
    "a generated manuscript of 1,000 and 2,000 pages in sections, with one typist",
  ],
];

/** The sizes and durations of each mode: a row's label, then its quick, standard and full values. */
export const MODE_SIZES: readonly (readonly [
  string,
  string,
  string,
  string,
])[] = [
  ["processes", "1", "the scenario's own", "the scenario's own"],
  [
    "samples of each metric a process",
    "at most 3",
    "the scenario's own",
    "the scenario's own",
  ],
  ["client memory soak", "1 min", "10 min", "120 min"],
  ["server soak", "1 min", "10 min", "480 min"],
  ["aged sessions", "400", "400, 2,000, 10,000", "400, 2,000, 10,000, 50,000"],
  ["kills in server.durability", "10", "200", "200"],
];

export const LIMITS: readonly string[] = [
  "A container's processor limit gives a fast core in bursts, not a slow core, so typing is also measured with Chromium's processor slowdown at 4 and 6 times.",
  "The slowdown stretches the page's own JavaScript, style and layout on its main thread. It does not slow the browser's other processes, the network, the disk, memory bandwidth, the server or the sync path, and it does not model a slower graphics card or a hot laptop that lowers its clock. A 4x figure is a bound for script cost on a slower processor, not a prediction for any one laptop.",
  "Containers have no graphics card, so paint times read worse than on a real machine.",
  "Docker runs Linux only. Windows is checked on shared CI machines for whether the app works, never for timing; macOS is measured directly on one Apple-silicon laptop, the host tier. Processor emulation is never used for timing.",
  "Server figures come from the D-small container, where the simulated clients share the server's one core, so they read worse than a server alone would.",
  "Headless Chromium has no spellchecker and no display pacing.",
  "Simulated: writers and readers at the rates of the profiles above, generated scripts and prose, and offline hours compressed into seconds. Not simulated: real typists, real networks with loss and delay, and browsers other than Chromium.",
];

/** The limits to state first; `limits` is the measured comfort limit of each tier. */
export function limitsFirst(limits: string): string[] {
  return [
    `The 2,000-page length is a target, not a promise. The measured comfort limit of each tier stands in its place: ${limits}.`,
    "A project can hold thousands of documents and any number of versions, because neither is loaded with the script being edited.",
    "Offline storage in a browser is kept at the browser's discretion; the desktop app is the durable offline client.",
    "Who wrote each character is kept character by character only since the newest checkpoint; older versions record it per block.",
    "Characters outside the script font are kept, but not typeset or printed correctly.",
    "The half of the wrong design that keeps thousands of versions inside the live document cannot be built here, so it is not measured and no figure is given.",
  ];
}

/** The notice's own placeholder for a script's title, escaped so that Markdown prints it. */
const TITLE_PLACEHOLDER = "&lt;title&gt;";

export function comfortNotice(
  comfortLimitPages: string,
  limits: string,
): string {
  return `The app shows one notice, on every device, once a script passes ${comfortLimitPages} pages: '${TITLE_PLACEHOLDER}' is longer than this device handles comfortably, so typing may slow down. That figure comes from one reference machine. The measured comfort limits are: ${limits}. A slower device slows down before it is told; a faster one is told early.`;
}

export const WRONG_DESIGN =
  "This section measures a layout the app does not use, to show what it avoids: one 1,000-page script in a single section beside the same length in sections, and one daily document reused for 60 days beside a new document each day. The single-section script is measured with one typist, not ten writers and fifty readers. Its second half, a document that keeps 3,000 versions inside itself, cannot be built, because the CRDT layer has no switch that keeps deleted history; it is not measured, and no figure is given.";

export const LONG_BOOK =
  "The long book is generated prose in the manuscript format, at 1,000 and 2,000 pages, typed beside screenplays of the same lengths. A page of prose holds far fewer blocks than a page of a script, so the comparison shows whether cost follows blocks or words. It is measured with one typist, not two writers and five readers, and without its 200 versions.";

/** The verdict words of the budget table. */
export const VERDICT_WORDS = {
  pass: "pass",
  over_budget: "over budget",
  hard_fail: "hard fail",
  undecided: "undecided",
  too_few_samples: "undecided — too few samples",
  constant: "undecided — every sample was equal",
  not_measured: "not measured",
} as const;

export const heldBy = (path: string): string => `held by ${path}`;

export function budgetSummary(counts: {
  n: number;
  pass: number;
  over: number;
  hard: number;
  undecided: number;
  notMeasured: number;
}): string {
  const { n, pass, over, hard, undecided, notMeasured } = counts;
  return `${n} budgets: ${pass} pass, ${over} over budget, ${hard} hard fail, ${undecided} undecided, ${notMeasured} not measured`;
}

export const hardFails = (rows: readonly string[]): string =>
  `Hard fails: ${rows.join(", ")}.`;

/** The reason the desktop rows read not measured when no smoke file was given. */
export const NO_SMOKE =
  "the desktop smoke results of the three systems were not available to this run";

export const NO_BEARING = "no measurement bears on this";

/** The reasons of the Not measured lines. */
export const REASONS = {
  busy: (load: string, spread: string): string =>
    `the machine was not quiet: load ${load}, calibration spread ${spread}`,
  failed: (lastLine: string): string => `could not finish: ${lastLine}`,
  unmatched: "no scenario measures it",
  unproved: "its samples do not pass through the shared measuring path",
  notJudged: (tier: string, items: readonly string[]): string =>
    `no run on ${tier} judged ${items.join(", ")}`,
  noRun: (ids: readonly string[]): string => `no run holds ${ids.join(", ")}`,
  noIdleReading: (platform: string): string =>
    `${platform} gives no reading of idle memory`,
  proofUnits: "not proved: its failing cases are its owner's unit tests",
  proofMarks:
    "not proved: its samples are product marks, whose recording path packages/perf/test/marks.test.ts proves",
  proofLong: "not proved: a proof would take an hour",
} as const;

/** `<what>: <reason>.`, as one item of a list; a reason that is a sentence keeps one full stop. */
export const notMeasuredLine = (what: string, reason: string): string =>
  `- ${what}: ${reason.replace(/\.$/, "")}.`;
