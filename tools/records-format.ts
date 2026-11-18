// How each public record is read: Markdown lines, and the changelog, decision, index, lesson and AGENTS.md formats.
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  AGENTS_GATE,
  AGENTS_LINKS,
  AGENTS_MAX_WORDS,
  CHANGE_GROUPS,
  CODE_SPAN,
  DECIDERS,
  DECISION_SECTIONS,
  DECISIONS_DIR,
  FENCE,
  LESSON_PARTS,
} from "./records.config.ts";

/** Reports one violation in the file being read. */
export type Add = (line: number, message: string) => void;

/** `n` is 1-based; `code` is true inside a fenced block and on its two fence lines. */
export interface Line {
  n: number;
  text: string;
  code: boolean;
}

/**
 * What the index and the status check need to know about one record. `file` is `docs/decisions/<name>`;
 * `number` is the four digits of the name; `title` is null when line 1 is not "# NNNN. Title";
 * `superseded` is the NNNN of "Superseded by NNNN"; `statusLine` is 1 when there is no Status line.
 */
export interface DecisionRecord {
  file: string;
  name: string;
  number: string;
  title: string | null;
  superseded: string | null;
  statusLine: number;
}

interface Heading {
  n: number;
  level: number;
  text: string;
}

interface Field {
  n: number;
  key: string;
  value: string;
}

/** The headings of one record or lesson, those it must have, the line its scope ends before, and where a lacking part is reported. */
interface Parts {
  headings: readonly Heading[];
  expected: readonly string[];
  prefix: "##" | "###";
  end: number;
  lackAt: number;
}

export const DECISION_NAME = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

const HEADING = /^(#{1,6}) +(.+?)\s*$/;
const FIELD = /^- ([^:]+): (.*)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RELEASE = /^\[\d+\.\d+\.\d+\] - (\d{4}-\d{2}-\d{2})$/;
const ENTRY = /^- (\d{4}-\d{2}-\d{2}) — \S/;
const DECISION_TITLE = /^# (\d{4})\. +(.+?)\s*$/;
const SUPERSEDED = /^Superseded by (\d{4})$/;
const INDEX_LINE = /^- \[.*\]\((\d{4}-[^)]*\.md)\)/;

const DECISION_FIELDS = ["Date", "Status", "Decided by"] as const;
const GROUP_NAMES: ReadonlySet<string> = new Set(CHANGE_GROUPS);
const DECIDER_NAMES: ReadonlySet<string> = new Set(DECIDERS);

export function readLines(source: string): Line[] {
  let marker: string | null = null;
  return source.split(/\r?\n/).map((text, i) => {
    const fence = FENCE.exec(text)?.[1] ?? null;
    const code = marker !== null || fence !== null;
    if (marker === null) marker = fence;
    else if (fence === marker) marker = null;
    return { n: i + 1, text, code };
  });
}

function headingOf(line: Line): Heading | null {
  const match = line.code ? null : HEADING.exec(line.text);
  if (!match) return null;
  const [, hashes = "", text = ""] = match;
  return { n: line.n, level: hashes.length, text };
}

const headingsAt = (lines: readonly Line[], level: number): Heading[] =>
  lines.flatMap((line) => {
    const heading = headingOf(line);
    return heading?.level === level ? [heading] : [];
  });

/** The `- Key: value` lines among `lines`. */
function fieldsIn(lines: readonly Line[]): Field[] {
  return lines.flatMap((line) => {
    const match = line.code ? null : FIELD.exec(line.text);
    if (!match) return [];
    const [, key = "", value = ""] = match;
    return [{ n: line.n, key, value: value.trim() }];
  });
}

/** A real day written YYYY-MM-DD. */
function isDate(value: string): boolean {
  const time = DATE.test(value) ? Date.parse(`${value}T00:00:00Z`) : Number.NaN;
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
}

/** The `- <key>:` field when there is exactly one. */
function only(fields: readonly Field[], key: string): Field | null {
  const found = fields.filter((field) => field.key === key);
  return found.length === 1 ? (found[0] ?? null) : null;
}

/** The field's date, else null once its value is reported. */
function dateOf(field: Field, add: Add): string | null {
  if (isDate(field.value)) return field.value;
  add(field.n, `has date "${field.value}"; write YYYY-MM-DD`);
  return null;
}

/** The first heading out of place, else every part with no text; true when the headings are the expected ones. */
function checkParts(lines: readonly Line[], parts: Parts, add: Add): boolean {
  const { headings, expected, prefix } = parts;
  for (const [i, wanted] of expected.entries()) {
    const found = headings[i];
    if (found?.text === wanted) continue;
    if (found === undefined) add(parts.lackAt, `lacks "${prefix} ${wanted}"`);
    else
      add(
        found.n,
        `has "${prefix} ${found.text}" where "${prefix} ${wanted}" belongs`,
      );
    return false;
  }
  const extra = headings[expected.length];
  if (extra !== undefined) {
    add(extra.n, `has "${prefix} ${extra.text}" after the last part`);
    return false;
  }
  for (const [i, heading] of headings.entries()) {
    const end = headings[i + 1]?.n ?? parts.end;
    const body = lines.slice(heading.n, end - 1);
    if (!body.some((line) => line.text.trim() !== ""))
      add(heading.n, `"${prefix} ${heading.text}" is empty`);
  }
  return true;
}

interface Group {
  n: number;
  entries: number;
  /** The date of the last dated entry, for the newest-first rule. */
  above: string | null;
}

const FIRST_RELEASE = 'the first release heading must be "## [Unreleased]"';

function checkRelease(heading: Heading, first: boolean, add: Add): void {
  const date = RELEASE.exec(heading.text)?.[1] ?? "";
  if (first && heading.text !== "[Unreleased]") add(heading.n, FIRST_RELEASE);
  else if (!first && !isDate(date))
    add(heading.n, 'is not a release heading; write "## [1.2.3] - YYYY-MM-DD"');
}

function checkEntry(line: Line, group: Group, add: Add): void {
  const date = ENTRY.exec(line.text)?.[1] ?? "";
  if (!isDate(date)) return add(line.n, 'must begin "- YYYY-MM-DD — "');
  if (group.above !== null && date > group.above)
    add(line.n, "is dated after the entry above it; newest entries go first");
  group.above = date;
}

/** Returns the number of entries that sit under a group. */
export function checkChangelog(source: string, add: Add): number {
  const lines = readLines(source);
  if (lines[0]?.text !== "# Changelog") add(1, 'must begin with "# Changelog"');
  let releases = 0;
  let seen = new Set<string>();
  let group: Group | null = null;
  const groups: Group[] = [];
  for (const line of lines) {
    const heading = headingOf(line);
    const name = heading?.text ?? "";
    if (heading?.level === 2) {
      checkRelease(heading, releases++ === 0, add);
      seen = new Set();
      group = null;
    } else if (heading?.level === 3) {
      group = { n: heading.n, entries: 0, above: null };
      groups.push(group);
      if (releases === 0) add(heading.n, "is a group outside a release");
      else if (!GROUP_NAMES.has(name))
        add(heading.n, `"${name}" is not one of ${CHANGE_GROUPS.join(", ")}`);
      else if (seen.has(name))
        add(heading.n, `repeats "### ${name}" in one release`);
      seen.add(name);
    } else if (!line.code && line.text.startsWith("- ")) {
      if (group === null)
        add(line.n, 'is an entry outside a group such as "### Added"');
      else {
        group.entries++;
        checkEntry(line, group, add);
      }
    }
  }
  if (releases === 0) add(1, FIRST_RELEASE);
  for (const empty of groups.filter((found) => found.entries === 0))
    add(empty.n, "is a group with no entries");
  return groups.reduce((sum, found) => sum + found.entries, 0);
}

function decisionTitle(first: string, number: string, add: Add): string | null {
  const match = DECISION_TITLE.exec(first);
  if (!match) {
    add(1, 'must begin "# NNNN. Title"');
    return null;
  }
  const [, titled = "", title = ""] = match;
  if (titled !== number) add(1, `is titled ${titled} but named ${number}`);
  return title;
}

export function checkDecision(
  name: string,
  source: string,
  add: (
    rule: "decision-format" | "decision-status",
    line: number,
    message: string,
  ) => void,
): DecisionRecord {
  const format: Add = (line, message) => add("decision-format", line, message);
  const number = DECISION_NAME.exec(name)?.[1] ?? "";
  const lines = readLines(source);
  const title = decisionTitle(lines[0]?.text ?? "", number, format);
  const headings = headingsAt(lines, 2);
  const end = lines.length + 1;
  const fields = fieldsIn(lines.slice(0, (headings[0]?.n ?? end) - 1));
  const [date, status, decider] = DECISION_FIELDS.map((key) => {
    const field = only(fields, key);
    if (field === null)
      format(1, `needs exactly one "- ${key}:" line before the first section`);
    return field;
  });
  if (date) dateOf(date, format);
  if (decider && !DECIDER_NAMES.has(decider.value))
    format(
      decider.n,
      `is decided by "${decider.value}"; name a role: ${DECIDERS.join(", ")}`,
    );
  const superseded = status ? SUPERSEDED.exec(status.value)?.[1] : undefined;
  if (status && status.value !== "Accepted" && superseded === undefined)
    add(
      "decision-status",
      status.n,
      `has status "${status.value}"; write Accepted or Superseded by NNNN`,
    );
  checkParts(
    lines,
    { headings, expected: DECISION_SECTIONS, prefix: "##", end, lackAt: 1 },
    format,
  );
  return {
    file: `${DECISIONS_DIR}/${name}`,
    name,
    number,
    title,
    superseded: superseded ?? null,
    statusLine: status?.n ?? 1,
  };
}

function indexLine(record: DecisionRecord, title: string): string {
  const line = `- [${record.number}. ${title}](${record.name})`;
  return record.superseded === null
    ? line
    : `${line} — superseded by ${record.superseded}`;
}

export function checkIndex(
  source: string,
  decisions: readonly DecisionRecord[],
  add: Add,
): void {
  const lines = readLines(source);
  const heading =
    headingsAt(lines, 2).find((found) => found.text === "Index")?.n ?? 1;
  const byName = new Map(decisions.map((record) => [record.name, record]));
  const seen = new Set<string>();
  let previous: string | null = null;
  for (const line of lines) {
    const target = line.code ? undefined : INDEX_LINE.exec(line.text)?.[1];
    if (target === undefined) continue;
    const record = byName.get(target);
    const expected = record?.title ? indexLine(record, record.title) : null;
    if (record === undefined)
      add(line.n, `links to ${target}, which is not a record`);
    else if (seen.has(target)) add(line.n, `lists ${target} twice`);
    else if (expected !== null && line.text.trimEnd() !== expected)
      add(line.n, `must read: ${expected}`);
    else if (previous !== null && target < previous)
      add(line.n, "is out of order");
    if (record === undefined || seen.has(target)) continue;
    seen.add(target);
    previous = target;
  }
  for (const record of decisions)
    if (record.title !== null && !seen.has(record.name))
      add(heading, `the index lacks: ${indexLine(record, record.title)}`);
}

/** Every code span holding a `/` is a path that must exist; with none, the text begins "Nothing yet". */
function checkEnforcedBy(
  root: string,
  heading: Heading,
  body: readonly Line[],
  add: Add,
): void {
  let paths = 0;
  for (const line of body) {
    if (line.code) continue;
    for (const [, span = ""] of line.text.matchAll(CODE_SPAN)) {
      if (!span.includes("/")) continue;
      paths++;
      if (!existsSync(join(root, span)))
        add(line.n, `points at ${span}, which does not exist`);
    }
  }
  const text = body.map((line) => line.text).join("\n");
  if (paths === 0 && !text.trim().startsWith("Nothing yet"))
    add(heading.n, 'must name a file in backticks or begin "Nothing yet"');
}

/** The lesson's date, when it has exactly one and it is valid. */
function lessonDate(
  fields: readonly Field[],
  title: Heading,
  above: string | null,
  add: Add,
): string | null {
  const field = only(fields, "Date");
  if (field === null)
    add(title.n, 'needs exactly one "- Date:" line before "### What happened"');
  const date = field === null ? null : dateOf(field, add);
  if (field !== null && date !== null && above !== null && date > above)
    add(field.n, "is dated after the lesson above it; newest lessons go first");
  return date;
}

/** Returns the number of lessons. */
export function checkLessons(root: string, source: string, add: Add): number {
  const lines = readLines(source);
  if (lines[0]?.text !== "# Lessons") add(1, 'must begin with "# Lessons"');
  const titles = headingsAt(lines, 2);
  const parts = headingsAt(lines, 3);
  const seen = new Set<string>();
  let above: string | null = null;
  for (const [i, title] of titles.entries()) {
    const end = titles[i + 1]?.n ?? lines.length + 1;
    const key = title.text.toLowerCase();
    if (seen.has(key)) add(title.n, "repeats the title of an earlier lesson");
    seen.add(key);
    const own = parts.filter((part) => part.n > title.n && part.n < end);
    const fields = fieldsIn(lines.slice(title.n, (own[0]?.n ?? end) - 1));
    above = lessonDate(fields, title, above, add) ?? above;
    const lesson: Parts = {
      headings: own,
      expected: LESSON_PARTS,
      prefix: "###",
      end,
      lackAt: title.n,
    };
    const enforced = own[LESSON_PARTS.length - 1];
    if (checkParts(lines, lesson, add) && enforced)
      checkEnforcedBy(root, enforced, lines.slice(enforced.n, end - 1), add);
  }
  return titles.length;
}

export function checkAgents(source: string, add: Add): void {
  const words = source.match(/\S+/g)?.length ?? 0;
  if (words > AGENTS_MAX_WORDS)
    add(
      1,
      `has ${words} words; the limit is ${AGENTS_MAX_WORDS}, two minutes of reading`,
    );
  if (!source.includes(AGENTS_GATE))
    add(1, `must say how to run the gate: ${AGENTS_GATE}`);
  for (const link of AGENTS_LINKS)
    if (!source.includes(`](${link})`)) add(1, `must link to ${link}`);
}
