import { afterAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTempTrees } from "@manent/testkit";
import { checkRecords } from "../check-records.ts";
import type { LocalRules, RecordedSums } from "../check-records.ts";
import { licenseSum, sectionSum } from "../records-status.ts";
import {
  loadLocalRules,
  parseExclude,
  parseTermList,
} from "../records-privacy.ts";

const repoRoot = join(import.meta.dir, "..", "..");

/** How many lines of a file in this repository begin with `start`. */
const linesStarting = (file: string, start: string) =>
  readFileSync(join(repoRoot, file), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.startsWith(start)).length;

const trees = createTempTrees("manent-records-");
afterAll(trees.removeAll);

/** A repository holding `files`; a null text leaves that file out. */
async function tree(files: Record<string, string | null>): Promise<string> {
  const present: Record<string, string> = {};
  for (const [path, text] of Object.entries(files))
    if (text !== null) present[path] = text;
  return await trees.tree(present);
}

const lines = (...text: string[]) => text.join("\n") + "\n";
const NONE: LocalRules = { paths: [], terms: [], violations: [], files: null };

const decision = (number: string, title: string, status = "Accepted") =>
  lines(
    `# ${number}. ${title}`, // 1
    "",
    "- Date: 2026-11-17", // 3
    `- Status: ${status}`, // 4
    "- Decided by: engineering lead", // 5
    "",
    "## Context", // 7
    "",
    "Why a choice was needed.", // 9
    "",
    "## Options considered", // 11
    "",
    "One, and the other.", // 13
    "",
    "## Decision", // 15
    "",
    "The first.", // 17
    "",
    "## Consequences and trade-offs", // 19
    "",
    "What it costs.", // 21
    "",
    "## Revisit when", // 23
    "",
    "The numbers change.", // 25
  );

const AGENTS = "AGENTS.md";
const CHANGELOG = "CHANGELOG.md";
const INDEX = "docs/decisions/README.md";
const ONE = "docs/decisions/0001-use-one-thing.md";
const TWO = "docs/decisions/0002-use-the-other-thing.md";
const LESSONS = "docs/memory/lessons.md";
const README = "README.md";
const OVERVIEW = "docs/architecture/overview.md";
const LICENSE = "LICENSE";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
const ROW_ONE =
  "- [0001. Use one thing](0001-use-one-thing.md) — superseded by 0002";
const ROW_TWO = "- [0002. Use the other thing](0002-use-the-other-thing.md)";

const GOOD: Record<string, string> = {
  [AGENTS]: lines(
    "# Working in this repository",
    "",
    "Run `bun run verify` before you finish.",
    "",
    "- [CHANGELOG.md](CHANGELOG.md)",
    "- [Decisions](docs/decisions/README.md)",
    "- [Lessons](docs/memory/lessons.md)",
  ),
  [CHANGELOG]: lines(
    "# Changelog", // 1
    "",
    "## [Unreleased]", // 3
    "",
    "### Added", // 5
    "",
    "- 2026-11-18 — A second thing.", // 7
    "- 2026-11-17 — A first thing,", // 8
    "  on two lines.",
    "",
    "### Fixed", // 11
    "",
    "- 2026-11-17 — A slip.", // 13
    "",
    "## [0.1.0] - 2026-11-16", // 15
    "",
    "### Added", // 17
    "",
    "- 2026-11-16 — The start.", // 19
  ),
  [INDEX]: lines(
    "# Decisions", // 1
    "",
    "```text", // 3
    "# NNNN. Title",
    "## Context",
    "```",
    "",
    "## Index", // 8
    "",
    ROW_ONE, // 10
    ROW_TWO, // 11
  ),
  [ONE]: decision("0001", "Use one thing", "Superseded by 0002"),
  [TWO]: decision("0002", "Use the other thing"),
  [LESSONS]: lines(
    "# Lessons", // 1
    "",
    "## A later slip", // 3
    "",
    "- Date: 2026-11-18", // 5
    "",
    "### What happened", // 7
    "",
    "It broke.", // 9
    "",
    "### How it was caught", // 11
    "",
    "A review.", // 13
    "",
    "### Rule", // 15
    "",
    "Do the other thing.", // 17
    "",
    "### Enforced by", // 19
    "",
    '`tools/test/a.test.ts` — "it holds".', // 21
    "",
    "## An earlier slip", // 23
    "",
    "- Date: 2026-11-17", // 25
    "",
    "### What happened", // 27
    "",
    "It nearly broke.", // 29
    "",
    "### How it was caught", // 31
    "",
    "A test.", // 33
    "",
    "### Rule", // 35
    "",
    "Check first.", // 37
    "",
    "### Enforced by", // 39
    "",
    "Nothing yet. A test arrives with the editor.", // 41
  ),
  [README]: lines(
    "# Manent", // 1
    "",
    "A script-writing app.", // 3
    "",
    "- [Architecture](docs/architecture/overview.md)", // 5
    "",
    "## Acknowledgement", // 7
    "",
    "Thanks to the Quokka project.", // 9
    "",
    "## Licence", // 11
    "",
    "PolyForm Strict License 1.0.0; the [LICENSE](LICENSE) file rules.", // 13
    "",
    "Get in touch: https://github.com/someone or someone@example.org", // 15
  ),
  [LICENSE]: lines(
    "Manent", // 1
    "Copyright (c) 2026 A. Holder",
    "",
    "-".repeat(80), // 4
    "",
    "The terms.", // 6
  ),
  [OVERVIEW]: lines(
    "# Architecture overview", // 1
    "",
    "| Package | Layer | Responsibility | Status |", // 3
    "| --- | --- | --- | --- |",
    "| `one` | Kernel | Values | **built** |", // 5
    "| `two` | Kernel | More values | **planned** |", // 6
    "| `tools` | Tooling | Checks | **in progress**: one check |", // 7
    "",
    "See [the rules](../../AGENTS.md).", // 9
  ),
  "package.json": JSON.stringify({
    name: "fixture",
    private: true,
    workspaces: { packages: ["packages/*", "tools"] },
  }),
  "packages/one/package.json": '{ "name": "@manent/one" }\n',
  "packages/one/src/index.ts": "export const one = 1;\n",
  "packages/two/package.json": '{ "name": "@manent/two" }\n',
  "packages/two/src/index.ts": "export {};\n",
  "tools/package.json": '{ "name": "@manent/tools" }\n',
  "tools/test/a.test.ts": "export const a = 1;\n",
};

const good = (file: string): string => GOOD[file] ?? "";
const sha256 = (text: string) =>
  new Bun.CryptoHasher("sha256").update(text).digest("hex");
/** The fixture's recorded texts: its licence terms and its README's two fixed sections. */
const SUMS: RecordedSums = {
  license: sha256("\nThe terms."),
  sections: {
    Acknowledgement: sha256("Thanks to the Quokka project."),
    Licence: sha256(
      "PolyForm Strict License 1.0.0; the [LICENSE](LICENSE) file rules.\n\nGet in touch: https://github.com/someone or someone@example.org",
    ),
  },
};

const row = (name: string, status: string) =>
  `| \`${name}\` | Kernel | Values | ${status} |`;
const tracked = (...paths: string[]): LocalRules => ({
  ...NONE,
  files: new Set([...Object.keys(GOOD), ...paths]),
});

/** GOOD's `file` with some lines replaced (1-based); null drops the line. */
function edit(
  file: string,
  changes: Record<number, string | null>,
): Record<string, string> {
  const out = good(file)
    .split("\n")
    .flatMap((line, i) => {
      const change = changes[i + 1];
      return change === undefined ? [line] : change === null ? [] : [change];
    });
  return { [file]: out.join("\n") };
}

/** Each finding as `<file>:<line> <rule>`. */
async function check(
  files: Record<string, string | null> = {},
  local: LocalRules = NONE,
): Promise<string[]> {
  const root = await tree({ ...GOOD, ...files });
  return (await checkRecords(root, local, SUMS)).map(
    (f) => `${f.file}:${f.line} ${f.rule}`,
  );
}

test("documents that follow every rule have no violations", async () => {
  expect(await checkRecords(await tree(GOOD), NONE, SUMS)).toEqual([]);
});

test("each required document must exist, and a link to a missing one is said", async () => {
  expect(
    await check({ [AGENTS]: null, [CHANGELOG]: null, [LESSONS]: null }),
  ).toEqual([
    "AGENTS.md:1 missing-file",
    "CHANGELOG.md:1 missing-file",
    "docs/architecture/overview.md:9 link",
    "docs/memory/lessons.md:1 missing-file",
  ]);
  expect(await check({ [INDEX]: null })).toEqual([
    "AGENTS.md:6 link",
    "docs/decisions/README.md:1 missing-file",
  ]);
});

test("the changelog parses and keeps an Unreleased section, newest first", async () => {
  expect(await check(edit(CHANGELOG, { 1: "# Changes" }))).toEqual([
    "CHANGELOG.md:1 changelog",
  ]);
  expect(
    await check(edit(CHANGELOG, { 3: "## [0.2.0] - 2026-11-18" })),
  ).toEqual(["CHANGELOG.md:3 changelog"]);
  expect(await check(edit(CHANGELOG, { 15: "## [Unreleased]" }))).toEqual([
    "CHANGELOG.md:15 changelog",
  ]);
  expect(await check(edit(CHANGELOG, { 15: "## 0.1.0" }))).toEqual([
    "CHANGELOG.md:15 changelog",
  ]);
  expect(await check(edit(CHANGELOG, { 5: "### Improved" }))).toEqual([
    "CHANGELOG.md:5 changelog",
  ]);
  expect(await check(edit(CHANGELOG, { 11: "### Added" }))).toEqual([
    "CHANGELOG.md:11 changelog",
  ]);
  expect(await check(edit(CHANGELOG, { 7: "- A second thing." }))).toEqual([
    "CHANGELOG.md:7 changelog",
  ]);
  expect(
    await check(edit(CHANGELOG, { 7: "- 2026-02-30 — A second thing." })),
  ).toEqual(["CHANGELOG.md:7 changelog"]);
  expect(
    await check(
      edit(CHANGELOG, {
        7: "- 2026-11-17 — A first thing.",
        8: "- 2026-11-18 — A second thing,",
      }),
    ),
  ).toEqual(["CHANGELOG.md:8 changelog"]);
  // an entry outside a group, and a group left empty
  expect(await check(edit(CHANGELOG, { 5: null }))).toEqual([
    "CHANGELOG.md:6 changelog",
    "CHANGELOG.md:7 changelog",
  ]);
  expect(await check(edit(CHANGELOG, { 13: null }))).toEqual([
    "CHANGELOG.md:11 changelog",
  ]);
});

test("a decision record has its number, date, role and sections", async () => {
  expect(await check(edit(TWO, { 1: "# 0003. Use the other thing" }))).toEqual([
    `${TWO}:1 decision-format`,
  ]);
  expect(await check(edit(TWO, { 1: "# Use the other thing" }))).toEqual([
    `${TWO}:1 decision-format`,
  ]);
  expect(await check(edit(TWO, { 3: "- Date: 2026-13-40" }))).toEqual([
    `${TWO}:3 decision-format`,
  ]);
  expect(await check(edit(TWO, { 3: null }))).toEqual([
    `${TWO}:1 decision-format`,
  ]);
  expect(await check(edit(TWO, { 5: "- Decided by: Sam Doe" }))).toEqual([
    `${TWO}:5 decision-format`,
  ]);
  expect(await check(edit(TWO, { 19: "## Consequences" }))).toEqual([
    `${TWO}:19 decision-format`,
  ]);
  expect(await check(edit(TWO, { 23: null, 24: null, 25: null }))).toEqual([
    `${TWO}:1 decision-format`,
  ]);
  expect(await check({ [TWO]: good(TWO) + "\n## Notes\n\nMore.\n" })).toEqual([
    `${TWO}:27 decision-format`,
  ]);
  expect(await check(edit(TWO, { 17: "" }))).toEqual([
    `${TWO}:15 decision-format`,
  ]);
});

test("a heading inside a code block is not a section", async () => {
  expect(
    await check(
      edit(TWO, { 9: "```text\n## Decision\n- Date: 1999-01-01\n```" }),
    ),
  ).toEqual([]);
  expect(
    await check(edit(LESSONS, { 9: "~~~\n## Not a lesson\n### Rule\n~~~" })),
  ).toEqual([]);
});

test("decision numbers run from 0001 with no gap and no repeat", async () => {
  expect(
    await check({ "docs/decisions/0004-skip.md": decision("0004", "Skip") }),
  ).toEqual([
    "docs/decisions/0004-skip.md:1 decision-number",
    `${INDEX}:8 decision-index`,
  ]);
  expect(
    await check({ "docs/decisions/0002-again.md": decision("0002", "Again") }),
  ).toEqual([`${TWO}:1 decision-number`, `${INDEX}:8 decision-index`]);
  expect(await check({ "docs/decisions/notes.md": "# Notes\n" })).toEqual([
    "docs/decisions/notes.md:1 decision-number",
  ]);
});

test("a status is Accepted or points at a later record", async () => {
  expect(await check(edit(TWO, { 4: "- Status: Rejected" }))).toEqual([
    `${TWO}:4 decision-status`,
  ]);
  expect(
    await check({
      ...edit(ONE, { 4: "- Status: Superseded by 0007" }),
      ...edit(INDEX, {
        10: "- [0001. Use one thing](0001-use-one-thing.md) — superseded by 0007",
      }),
    }),
  ).toEqual([`${ONE}:4 decision-status`]);
  expect(
    await check({
      ...edit(TWO, { 4: "- Status: Superseded by 0001" }),
      ...edit(INDEX, {
        11: "- [0002. Use the other thing](0002-use-the-other-thing.md) — superseded by 0001",
      }),
    }),
  ).toEqual([`${TWO}:4 decision-status`]);
});

test("the index lists every record once, in order, with its title and status", async () => {
  expect(await check(edit(INDEX, { 11: null }))).toEqual([
    `${INDEX}:8 decision-index`,
  ]);
  expect(await check(edit(INDEX, { 8: null, 11: null }))).toEqual([
    `${INDEX}:1 decision-index`,
  ]);
  expect(
    await check(
      edit(INDEX, {
        11: "- [0002. Something else](0002-use-the-other-thing.md)",
      }),
    ),
  ).toEqual([`${INDEX}:11 decision-index`]);
  expect(
    await check(
      edit(INDEX, { 10: "- [0001. Use one thing](0001-use-one-thing.md)" }),
    ),
  ).toEqual([`${INDEX}:10 decision-index`]);
  expect(
    await check({
      [INDEX]: good(INDEX) + "- [0009. Ghost](0009-ghost.md)\n",
    }),
  ).toEqual([`${INDEX}:12 decision-index`, `${INDEX}:12 link`]);
  expect(await check(edit(INDEX, { 10: ROW_TWO, 11: ROW_ONE }))).toEqual([
    `${INDEX}:11 decision-index`,
  ]);
  expect(await check({ [INDEX]: good(INDEX) + ROW_TWO + "\n" })).toEqual([
    `${INDEX}:12 decision-index`,
  ]);
});

test("a lesson has a date, its three parts and what enforces it, newest first", async () => {
  expect(await check(edit(LESSONS, { 1: "# Memory" }))).toEqual([
    `${LESSONS}:1 lesson-format`,
  ]);
  expect(await check(edit(LESSONS, { 11: "Later:" }))).toEqual([
    `${LESSONS}:15 lesson-format`,
  ]);
  expect(await check(edit(LESSONS, { 39: null, 40: null, 41: null }))).toEqual([
    `${LESSONS}:23 lesson-format`,
  ]);
  expect(await check(edit(LESSONS, { 17: "" }))).toEqual([
    `${LESSONS}:15 lesson-format`,
  ]);
  expect(await check(edit(LESSONS, { 5: null }))).toEqual([
    `${LESSONS}:3 lesson-format`,
  ]);
  expect(await check(edit(LESSONS, { 5: "- Date: soon" }))).toEqual([
    `${LESSONS}:5 lesson-format`,
  ]);
  expect(await check(edit(LESSONS, { 5: "- Date: 2026-11-16" }))).toEqual([
    `${LESSONS}:25 lesson-format`,
  ]);
  expect(await check(edit(LESSONS, { 23: "## A later slip" }))).toEqual([
    `${LESSONS}:23 lesson-format`,
  ]);
  expect(
    await check(edit(LESSONS, { 21: "`tools/test/gone.test.ts` holds it." })),
  ).toEqual([`${LESSONS}:21 lesson-format`]);
  expect(await check(edit(LESSONS, { 41: "A test, later." }))).toEqual([
    `${LESSONS}:39 lesson-format`,
  ]);
});

test("the standing rules stay short and point at the records", async () => {
  // GOOD's AGENTS.md has 18 words; the limit is 600
  expect(await check({ [AGENTS]: good(AGENTS) + words(582) + "\n" })).toEqual(
    [],
  );
  expect(await check({ [AGENTS]: good(AGENTS) + words(583) + "\n" })).toEqual([
    "AGENTS.md:1 agents",
  ]);
  expect(await check(edit(AGENTS, { 7: null }))).toEqual([
    "AGENTS.md:1 agents",
  ]);
  expect(
    await check(edit(AGENTS, { 3: "Run the gate before you finish." })),
  ).toEqual(["AGENTS.md:1 agents"]);
});

test("a record cites nothing its reader cannot open", async () => {
  const said = async (text: string) => await check(edit(LESSONS, { 9: text }));
  expect(await said("It broke, see section 5.2.")).toEqual([
    `${LESSONS}:9 section-ref`,
  ]);
  expect(await said("It broke (§4).")).toEqual([`${LESSONS}:9 section-ref`]);
  expect(await said("It broke in sections of 100 blocks.")).toEqual([]);
  expect(await said("It broke, as the design says.")).toEqual([
    `${LESSONS}:9 note-ref`,
  ]);
  expect(await said("It broke The Spec.")).toEqual([`${LESSONS}:9 note-ref`]);
  expect(await said("Task 14 found it, in plan 01.")).toEqual([
    `${LESSONS}:9 note-ref`,
  ]);
  expect(
    await said("The design system and the specification were fine."),
  ).toEqual([]);
  expect(await said("It broke in /Users/sam/notes.")).toEqual([
    `${LESSONS}:9 home-path`,
  ]);
  expect(await said("It broke in `C:\\Users\\sam\\notes`.")).toEqual([
    `${LESSONS}:9 home-path`,
  ]);
  expect(await said("See https://example.com/home/page.")).toEqual([]);
  expect(await said("Write to sam@example.org.")).toEqual([
    `${LESSONS}:9 email`,
  ]);
  expect(
    await check(edit(README, { 3: "Write to someone@example.org." })),
  ).toEqual(["README.md:3 email"]);
  expect(await said("Pinned as bun@1.4.4, beside @manent/schema.")).toEqual([]);
  expect(await said("Ask at https://github.com/someone.")).toEqual([
    `${LESSONS}:9 profile-link`,
  ]);
  expect(await said("See https://github.com/someone/project.")).toEqual([]);
  expect(
    await check(
      edit(README, { 3: "Get in touch: https://github.com/someone" }),
    ),
  ).toEqual(["README.md:3 profile-link"]);
  expect(await said("See [the notes](../../notes/a.md).")).toEqual([
    `${LESSONS}:9 link`,
  ]);
  expect(await said("See [it](../decisions/0009-gone.md).")).toEqual([
    `${LESSONS}:9 link`,
  ]);
  expect(await said("See [it](../../../elsewhere/a.md).")).toEqual([
    `${LESSONS}:9 link`,
  ]);
  expect(
    await said(
      "See [one](../decisions/0001-use-one-thing.md#context), [two](#rule), [three](https://example.com/a) and [four](../../tools/test/a.test.ts).",
    ),
  ).toEqual([]);
});

test("what this machine keeps private stays out of the records", async () => {
  const local: LocalRules = {
    files: null,
    paths: ["notes/", "docs/drafts", ".scratch"],
    terms: [new RegExp(String.raw`\bzebra\b`, "i")],
    violations: [
      {
        file: ".git/info/records-private-terms",
        line: 2,
        rule: "local-list",
        message: "is not a valid pattern",
      },
    ],
  };
  const said = async (file: string, line: number, text: string) =>
    await check(edit(file, { [line]: text }), local);
  const listed = ".git/info/records-private-terms:2 local-list";
  expect(await check({}, local)).toEqual([listed]);
  expect(await said(CHANGELOG, 7, "- 2026-11-18 — See Notes/plan.md.")).toEqual(
    [listed, "CHANGELOG.md:7 private-path"],
  );
  expect(await said(TWO, 9, "It is kept in docs/drafts today.")).toEqual([
    listed,
    `${TWO}:9 private-path`,
  ]);
  expect(await said(AGENTS, 3, "Run `bun run verify`; see .Scratch.")).toEqual([
    listed,
    "AGENTS.md:3 private-path",
  ]);
  expect(await said(INDEX, 4, "# NNNN. A Zebra crossing")).toEqual([
    listed,
    `${INDEX}:4 private-term`,
  ]);
  expect(await said(LESSONS, 9, "It broke the zebras.")).toEqual([listed]);
  // the README and every architecture page are read too
  expect(await said(README, 3, "Kept in docs/drafts.")).toEqual([
    listed,
    "README.md:3 private-path",
  ]);
  expect(
    await check(
      {
        "docs/architecture/layers.md": "# Layers\n\nA zebra, see section 2.\n",
      },
      local,
    ),
  ).toEqual([
    listed,
    "docs/architecture/layers.md:3 private-term",
    "docs/architecture/layers.md:3 section-ref",
  ]);
});

test("what this machine keeps private stays out of every tracked file", async () => {
  const source = "packages/one/src/notes.ts";
  const files = {
    [source]: '// a zebra\nexport const kept = "docs/drafts";\n',
    "packages/one/logo.bin": "zebra\0zebra\n",
    ...edit(LICENSE, { 2: "Copyright (c) 2026 Z. Zebra" }),
  };
  const local = (listed: boolean): LocalRules => ({
    paths: ["docs/drafts"],
    terms: [new RegExp(String.raw`\bzebra\b`, "i")],
    violations: [],
    files: listed
      ? new Set([...Object.keys(GOOD), source, "packages/one/logo.bin"])
      : null,
  });
  // source is read; the licence, which names its holder, and binary files are not
  expect(await check(files, local(true))).toEqual([
    `${source}:1 private-term`,
    `${source}:2 private-path`,
  ]);
  // outside a git checkout only the public documents are known
  expect(await check(files, local(false))).toEqual([]);
});

test("a link must lead to a file git tracks or would track", async () => {
  const untracked = "tools/out/report.md";
  const files = {
    [untracked]: "# Report\n",
    ...edit(LESSONS, { 9: "See [it](../../tools/out/report.md)." }),
  };
  expect(await check(files, NONE)).toEqual([]);
  expect(await check(files, tracked())).toEqual([`${LESSONS}:9 link`]);
  expect(await check(files, tracked(untracked))).toEqual([]);
  // a folder is tracked when a file inside it is
  expect(
    await check(edit(LESSONS, { 9: "See [them](../decisions/)." }), tracked()),
  ).toEqual([]);
});

test("link syntax inside code is not a link", async () => {
  expect(
    await check(edit(LESSONS, { 9: "Write `[title](gone.md)` to link." })),
  ).toEqual([]);
  expect(
    await check(edit(LESSONS, { 9: "```text\n[title](gone.md)\n```" })),
  ).toEqual([]);
});

test("the licence text is the one whose checksum was recorded", async () => {
  expect(licenseSum(good(LICENSE))).toBe(SUMS.license);
  expect(licenseSum("No separator here.\n")).toBeNull();
  expect(await check(edit(LICENSE, { 6: "Other terms." }))).toEqual([
    "LICENSE:5 license",
  ]);
  expect(await check(edit(LICENSE, { 6: "The terms.\n\nAnd more." }))).toEqual([
    "LICENSE:5 license",
  ]);
  // what stands above the separator is not part of the text
  expect(
    await check(edit(LICENSE, { 2: "Copyright (c) 2027 A. Holder" })),
  ).toEqual([]);
  expect(await check(edit(LICENSE, { 4: null }))).toEqual([
    "LICENSE:1 license",
  ]);
  expect(await check({ [LICENSE]: null })).toEqual([
    "LICENSE:1 license",
    "README.md:13 link",
  ]);
});

test("the README points to the licence, and nothing else restates it", async () => {
  // without its heading the contact line is an ordinary line again
  expect(await check(edit(README, { 11: "## Terms" }))).toEqual([
    "README.md:1 readme",
    "README.md:15 email",
    "README.md:15 profile-link",
  ]);
  expect(
    await check(edit(README, { 13: "See the [LICENSE](LICENSE) file." })),
  ).toEqual(["README.md:11 readme"]);
  expect(
    await check(edit(README, { 13: "PolyForm Strict License 1.0.0." })),
  ).toEqual(["README.md:11 readme"]);
  expect(
    await check(
      edit(AGENTS, { 3: "Run `bun run verify`. The licence is PolyForm." }),
    ),
  ).toEqual(["AGENTS.md:3 license"]);
  expect(
    await check({
      "docs/architecture/layers.md": "# Layers\n\nUnder the Polyform terms.\n",
    }),
  ).toEqual(["docs/architecture/layers.md:3 license"]);
  expect(
    await check(
      edit(CHANGELOG, { 7: "- 2026-11-18 — The PolyForm licence was chosen." }),
    ),
  ).toEqual([]);
});

test("the overview marks a workspace planned exactly while it is an empty entry", async () => {
  expect(await check(edit(OVERVIEW, { 6: row("two", "**built**") }))).toEqual([
    `${OVERVIEW}:6 status`,
  ]);
  expect(await check(edit(OVERVIEW, { 5: row("one", "**planned**") }))).toEqual(
    [`${OVERVIEW}:5 status`],
  );
  expect(
    await check({ "packages/two/src/more.ts": "export const two = 2;\n" }),
  ).toEqual([`${OVERVIEW}:6 status`]);
  // a registration list with no feature yet is still an empty entry
  expect(
    await check({
      "packages/two/src/index.ts":
        '// One line per feature folder.\nexport * from "./a/index.ts";\n',
      "packages/two/src/a/index.ts": "export {};\n",
    }),
  ).toEqual([]);
  expect(await check(edit(OVERVIEW, { 7: null }))).toEqual([
    `${OVERVIEW}:3 status`,
  ]);
  expect(await check(edit(OVERVIEW, { 7: row("ghost", "**built**") }))).toEqual(
    [`${OVERVIEW}:3 status`, `${OVERVIEW}:7 status`],
  );
  expect(await check(edit(OVERVIEW, { 7: row("one", "**built**") }))).toEqual([
    `${OVERVIEW}:3 status`,
    `${OVERVIEW}:7 status`,
  ]);
  expect(await check(edit(OVERVIEW, { 6: row("two", "soon") }))).toEqual([
    `${OVERVIEW}:3 status`,
    `${OVERVIEW}:6 status`,
  ]);
  expect(
    await check(
      edit(OVERVIEW, { 3: "| Name | Layer | Responsibility | Status |" }),
    ),
  ).toEqual([`${OVERVIEW}:1 status`]);
  // the formatter pads the cells
  expect(
    await check(
      edit(OVERVIEW, {
        3: "| Package | Layer   | Responsibility | Status                       |",
        5: "| `one`   | Kernel  | Values         | **built**                    |",
      }),
    ),
  ).toEqual([]);
});

test("the README's fixed sections keep their text, and what only they may hold stays in them", async () => {
  expect(sectionSum(good(README), "Acknowledgement")).toBe(
    SUMS.sections.Acknowledgement,
  );
  expect(sectionSum(good(README), "Licence")).toBe(SUMS.sections.Licence);
  expect(sectionSum("# Manent\n", "Licence")).toBeNull();
  const quokka = [new RegExp(String.raw`\bquokka\b`, "i")];
  const local: LocalRules = { ...NONE, terms: quokka };
  // the term, the address and the profile link inside the two sections
  expect(await check({}, local)).toEqual([]);
  // the same term anywhere else, the rest of the README included
  expect(await check(edit(README, { 3: "A Quokka app." }), local)).toEqual([
    "README.md:3 private-term",
  ]);
  expect(
    await check(edit(LESSONS, { 9: "It broke the quokka." }), local),
  ).toEqual([`${LESSONS}:9 private-term`]);
  const source = "packages/one/src/notes.ts";
  expect(
    await check(
      { [source]: "// a quokka\n" },
      { ...tracked(source), terms: quokka },
    ),
  ).toEqual([`${source}:1 private-term`]);
  // their text is fixed, and both must be there
  expect(
    await check(edit(README, { 9: "Thanks to the Quokka project, and more." })),
  ).toEqual(["README.md:7 readme"]);
  expect(
    await check(
      edit(README, { 15: "Get in touch: https://github.com/someone-else" }),
    ),
  ).toEqual(["README.md:11 readme"]);
  expect(await check(edit(README, { 7: "## Thanks" }))).toEqual([
    "README.md:1 readme",
  ]);
});

test("the local lists are read literally, and a broken one is said", async () => {
  expect(
    parseExclude(
      lines(
        "# a comment",
        "",
        "notes/",
        "/docs/drafts/",
        ".scratch/",
        "PRIVATE.md",
        "*.log",
        "!keep.md",
        "notes/",
      ),
    ),
  ).toEqual(["notes/", "docs/drafts", ".scratch", "PRIVATE.md"]);

  const list = parseTermList(
    lines("# a comment", "", String.raw`\bzebra\b`, "(", "   "),
  );
  expect(list.terms.map((t) => `${t.source} ${t.flags}`)).toEqual([
    String.raw`\bzebra\b i`,
  ]);
  expect(list.violations).toEqual([
    {
      file: ".git/info/records-private-terms",
      line: 4,
      rule: "local-list",
      message: "is not a valid pattern",
    },
  ]);
  expect(parseTermList("# only a comment\n")).toEqual({
    terms: [],
    violations: [
      {
        file: ".git/info/records-private-terms",
        line: 1,
        rule: "local-list",
        message: "has no terms",
      },
    ],
  });
});

test("a tree that is not a git checkout has no local rules", async () => {
  expect(await loadLocalRules(await tree({}))).toEqual(NONE);
});

test("line endings and a missing final newline change nothing", async () => {
  const crlf = Object.fromEntries(
    Object.entries(GOOD).map(([path, text]) => [
      path,
      text.trimEnd().replaceAll("\n", "\r\n"),
    ]),
  );
  expect(await check(crlf)).toEqual([]);
});

test("records that several branches add to are merged by union", () => {
  const attributes = readFileSync(join(repoRoot, ".gitattributes"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim());
  for (const file of [CHANGELOG, INDEX, LESSONS])
    expect(attributes).toContain(`${file} merge=union`);
});

test("this repository's public documents pass, and records are only ever added", async () => {
  expect(await checkRecords(repoRoot, await loadLocalRules(repoRoot))).toEqual(
    [],
  );
  const decisions = readdirSync(join(repoRoot, "docs/decisions")).filter(
    (name) => new RegExp("^\\d{4}-").test(name),
  );
  expect(decisions.length).toBeGreaterThanOrEqual(33);
  expect(linesStarting(LESSONS, "## ")).toBeGreaterThanOrEqual(21);
  expect(linesStarting(CHANGELOG, "- ")).toBeGreaterThanOrEqual(10);
});
