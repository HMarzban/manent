// Checks the public documents: their formats, what they claim about the repository, and what they may not say.
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  checkAgents,
  checkChangelog,
  checkDecision,
  checkIndex,
  checkLessons,
  DECISION_NAME,
} from "./records-format.ts";
import type { Add, DecisionRecord } from "./records-format.ts";
import {
  loadLocalRules,
  readIfPresent,
  scanPrivacy,
  scanTracked,
} from "./records-privacy.ts";
import {
  checkLicense,
  checkReadme,
  checkSilence,
  checkStatus,
} from "./records-status.ts";
import {
  AGENTS,
  ARCHITECTURE_DIR,
  CHANGELOG,
  DECISIONS_DIR,
  DECISIONS_INDEX,
  LESSONS,
  LICENSE_FILE,
  LICENSE_SHA256,
  OVERVIEW,
  PUBLIC_DIRS,
  PUBLIC_FILES,
  README,
  README_SECTION_SHA256,
  REQUIRED_FILES,
} from "./records.config.ts";
import type { ReadmeSection } from "./records.config.ts";

export type Rule =
  | "missing-file"
  | "changelog"
  | "decision-number"
  | "decision-format"
  | "decision-status"
  | "decision-index"
  | "lesson-format"
  | "agents"
  | "readme"
  | "license"
  | "status"
  | "section-ref"
  | "note-ref"
  | "home-path"
  | "email"
  | "profile-link"
  | "link"
  | "private-path"
  | "private-term"
  | "local-list";

export interface Violation {
  file: string;
  line: number;
  rule: Rule;
  message: string;
}

/** What only this machine knows: its private paths and terms, and the files git tracks or would track (null outside a git checkout). */
export interface LocalRules {
  paths: string[];
  terms: RegExp[];
  violations: Violation[];
  files: ReadonlySet<string> | null;
}

/** The checksums the licence text and the README's two fixed sections must keep. */
export interface RecordedSums {
  license: string;
  sections: Readonly<Record<ReadmeSection, string>>;
}

interface Inspection {
  violations: Violation[];
  decisions: number;
  lessons: number;
  entries: number;
}

const RECORDED: RecordedSums = Object.freeze({
  license: LICENSE_SHA256,
  sections: README_SECTION_SHA256,
});

/** By file, then line, then rule. */
function byPlace(a: Violation, b: Violation): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.line !== b.line) return a.line - b.line;
  if (a.rule === b.rule) return 0;
  return a.rule < b.rule ? -1 : 1;
}

/** Every public document that exists, by repository-relative path, in reading order. */
async function readDocuments(
  root: string,
  violations: Violation[],
): Promise<Map<string, string>> {
  const documents = new Map<string, string>();
  for (const file of new Set<string>([...PUBLIC_FILES, ...REQUIRED_FILES])) {
    const text = await readIfPresent(join(root, file));
    if (text !== null) documents.set(file, text);
    else if (REQUIRED_FILES.some((required) => required === file))
      violations.push({
        file,
        line: 1,
        rule: "missing-file",
        message: "is missing",
      });
  }
  for (const dir of PUBLIC_DIRS) {
    if (!existsSync(join(root, dir))) continue;
    const entries = await readdir(join(root, dir), { withFileTypes: true });
    const names = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .toSorted();
    for (const name of names) {
      const file = `${dir}/${name}`;
      if (!documents.has(file))
        documents.set(file, await readFile(join(root, file), "utf8"));
    }
  }
  return documents;
}

/** Numbering, format and status of every record, then the index; returns how many records there are. */
function checkDecisions(
  documents: ReadonlyMap<string, string>,
  adder: (file: string, rule: Rule) => Add,
): number {
  const records: DecisionRecord[] = [];
  const files = [...documents.keys()]
    .filter(
      (file) =>
        file.startsWith(`${DECISIONS_DIR}/`) && file !== DECISIONS_INDEX,
    )
    .toSorted();
  let next = 1;
  for (const file of files) {
    const name = file.slice(DECISIONS_DIR.length + 1);
    const number = DECISION_NAME.exec(name)?.[1];
    if (number === undefined) {
      adder(file, "decision-number")(1, "is not named NNNN-short-title.md");
      continue;
    }
    if (Number(number) !== next)
      adder(file, "decision-number")(
        1,
        `has number ${number}; the next number is ${String(next).padStart(4, "0")}`,
      );
    next = Number(number) + 1;
    const text = documents.get(file) ?? "";
    records.push(
      checkDecision(name, text, (rule, line, message) =>
        adder(file, rule)(line, message),
      ),
    );
  }
  for (const record of records) {
    const later = records.some(
      (other) =>
        other.number === record.superseded &&
        Number(other.number) > Number(record.number),
    );
    if (record.superseded !== null && !later)
      adder(record.file, "decision-status")(
        record.statusLine,
        `is superseded by ${record.superseded}, which is not a later record`,
      );
  }
  const index = documents.get(DECISIONS_INDEX);
  if (index !== undefined)
    checkIndex(index, records, adder(DECISIONS_INDEX, "decision-index"));
  return records.length;
}

/** The checks of each kind of document that exists. */
async function checkDocuments(
  root: string,
  documents: ReadonlyMap<string, string>,
  sums: RecordedSums,
  adder: (file: string, rule: Rule) => Add,
): Promise<{ lessons: number; entries: number }> {
  const agents = documents.get(AGENTS);
  if (agents !== undefined) checkAgents(agents, adder(AGENTS, "agents"));
  const changelog = documents.get(CHANGELOG);
  const entries =
    changelog === undefined
      ? 0
      : checkChangelog(changelog, adder(CHANGELOG, "changelog"));
  const readme = documents.get(README);
  if (readme !== undefined)
    checkReadme(readme, sums.sections, adder(README, "readme"));
  const overview = documents.get(OVERVIEW);
  if (overview !== undefined)
    await checkStatus(root, overview, adder(OVERVIEW, "status"));
  const lessonsText = documents.get(LESSONS);
  const lessons =
    lessonsText === undefined
      ? 0
      : checkLessons(root, lessonsText, adder(LESSONS, "lesson-format"));
  const license = await readIfPresent(join(root, LICENSE_FILE));
  checkLicense(license, sums.license, adder(LICENSE_FILE, "license"));
  for (const [file, text] of documents)
    if (file === AGENTS || file.startsWith(`${ARCHITECTURE_DIR}/`))
      checkSilence(text, adder(file, "license"));
  return { lessons, entries };
}

async function inspect(
  root: string,
  local: LocalRules,
  sums: RecordedSums,
): Promise<Inspection> {
  const violations: Violation[] = [...local.violations];
  const adder =
    (file: string, rule: Rule): Add =>
    (line, message) =>
      violations.push({ file, line, rule, message });
  const documents = await readDocuments(root, violations);
  const { lessons, entries } = await checkDocuments(
    root,
    documents,
    sums,
    adder,
  );
  const decisions = checkDecisions(documents, adder);
  for (const [file, text] of documents)
    violations.push(...scanPrivacy(root, file, text, local));
  violations.push(
    ...(await scanTracked(root, local, new Set(documents.keys()))),
  );
  return {
    violations: violations.toSorted(byPlace),
    decisions,
    lessons,
    entries,
  };
}

/** Every violation of the public documents under `root`; `sums` defaults to the recorded checksums. */
export async function checkRecords(
  root: string,
  local: LocalRules,
  sums: RecordedSums = RECORDED,
): Promise<Violation[]> {
  return (await inspect(root, local, sums)).violations;
}

if (import.meta.main) {
  const root = process.cwd();
  const local = await loadLocalRules(root);
  const { violations, decisions, lessons, entries } = await inspect(
    root,
    local,
    RECORDED,
  );
  for (const v of violations)
    console.log(`${v.file}:${v.line} ${v.rule} ${v.message}`);
  if (violations.length > 0) process.exit(1);
  console.log(
    `records in order: decisions ${decisions}, lessons ${lessons}, changelog entries ${entries}; local terms ${local.terms.length}, local paths ${local.paths.length}`,
  );
}
