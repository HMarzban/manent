// What the documents claim about the repository: the licence text, the README's two fixed sections and the package table.
import { readFile } from "node:fs/promises";
import { join, posix, sep } from "node:path";
import { readLines } from "./records-format.ts";
import type { Add, Line } from "./records-format.ts";
import {
  EMPTY_ENTRY,
  LICENSE_SEPARATOR,
  LICENSE_WORD,
  README_SECTIONS,
  STATUS_HEADER,
  STATUSES,
} from "./records.config.ts";
import type { ReadmeSection } from "./records.config.ts";

type Status = (typeof STATUSES)[number];

interface Section {
  heading: number;
  body: Line[];
}

interface Row {
  name: string;
  status: Status;
}

const REEXPORT = new RegExp('^export \\* from "[^"]+";$');
const WORKSPACE_CELL = new RegExp("^`([^`]+)`$");
const UNREAD_FOLDERS: ReadonlySet<string> = new Set([
  "node_modules",
  "dist",
  "test",
]);

const sha256 = (text: string): string =>
  new Bun.CryptoHasher("sha256").update(text).digest("hex");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** The line after the first separator, and the checksum of the text from there on; null without a separator. */
function belowSeparator(source: string): { line: number; sum: string } | null {
  const lines = source.split(/\r?\n/);
  const at = lines.findIndex((line) => LICENSE_SEPARATOR.test(line));
  if (at === -1) return null;
  const text = lines
    .slice(at + 1)
    .join("\n")
    .trimEnd();
  return { line: at + 2, sum: sha256(text) };
}

/** SHA-256 (hex) of the lines below the first separator line, joined by "\n", trailing white space trimmed; null without a separator. */
export function licenseSum(source: string): string | null {
  return belowSeparator(source)?.sum ?? null;
}

export function checkLicense(
  source: string | null,
  expected: string,
  add: Add,
): void {
  const below = source === null ? null : belowSeparator(source);
  if (source === null) add(1, "is missing");
  else if (below === null) add(1, "has no separator line of hyphens");
  else if (below.sum !== expected)
    add(
      below.line,
      "the text below the separator does not match the recorded checksum; restore it",
    );
}

/** The lines after the first "## <heading>" outside code, up to the next "## " heading. */
function findSection(lines: readonly Line[], heading: string): Section | null {
  const at = lines.findIndex(
    (line) => !line.code && line.text.trimEnd() === `## ${heading}`,
  );
  if (at === -1) return null;
  const rest = lines.slice(at + 1);
  const end = rest.findIndex(
    (line) => !line.code && line.text.startsWith("## "),
  );
  return { heading: at + 1, body: end === -1 ? rest : rest.slice(0, end) };
}

const sumOf = (section: Section): string =>
  sha256(
    section.body
      .map((line) => line.text)
      .join("\n")
      .trim(),
  );

/** SHA-256 (hex) of the section under "## <heading>", its lines joined by "\n" and trimmed; null when there is no such heading. */
export function sectionSum(source: string, heading: string): string | null {
  const section = findSection(readLines(source), heading);
  return section === null ? null : sumOf(section);
}

/** The 1-based numbers of the lines inside the README's two fixed sections, headings excluded. */
export function fixedLines(source: string): ReadonlySet<number> {
  const lines = readLines(source);
  return new Set(
    README_SECTIONS.flatMap(
      (name) => findSection(lines, name)?.body.map((line) => line.n) ?? [],
    ),
  );
}

export function checkReadme(
  source: string,
  expected: Readonly<Record<ReadmeSection, string>>,
  add: Add,
): void {
  const lines = readLines(source);
  for (const name of README_SECTIONS) {
    const section = findSection(lines, name);
    if (section === null) add(1, `lacks a "## ${name}" section`);
    else if (sumOf(section) !== expected[name])
      add(
        section.heading,
        "the section differs from its recorded text; restore it",
      );
  }
}

/** For the documents that must not restate the licence. */
export function checkSilence(source: string, add: Add): void {
  for (const line of readLines(source))
    if (LICENSE_WORD.test(line.text))
      add(line.n, "restates the licence; only README.md and LICENSE do");
}

/** The cells of a table row, trimmed, without the outer pipes. */
const cellsOf = (text: string): string[] =>
  text
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

const isHeader = (line: Line): boolean => {
  const [first, second] = cellsOf(line.text);
  return (
    !line.code && first === STATUS_HEADER[0] && second === STATUS_HEADER[1]
  );
};

/** A workspace in backticks first and a status last, or null. */
function readRow(text: string): Row | null {
  const cells = cellsOf(text);
  const name = WORKSPACE_CELL.exec(cells[0] ?? "")?.[1];
  const last = cells.at(-1) ?? "";
  const status = STATUSES.find((word) => last.startsWith(`**${word}**`));
  return name === undefined || status === undefined ? null : { name, status };
}

/** Each workspace's folder by name, found through the root manifest's globs. */
async function workspaceDirs(root: string): Promise<Map<string, string>> {
  const raw: unknown = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  const listed = isRecord(raw) ? raw.workspaces : null;
  const globs = isRecord(listed) ? listed.packages : listed;
  const dirs = new Map<string, string>();
  if (!isStringList(globs)) return dirs;
  for (const glob of globs) {
    const found = new Bun.Glob(`${glob}/package.json`).scan({ cwd: root });
    for await (const path of found) {
      const dir = posix.dirname(path.split(sep).join("/"));
      dirs.set(posix.basename(dir), dir);
    }
  }
  return dirs;
}

/** Only re-export lines and `export {};`, comments and blank lines aside. */
const isEmptyFile = (text: string): boolean =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("//"))
    .every((line) => line === EMPTY_ENTRY || REEXPORT.test(line));

async function isEmptyEntry(root: string, dir: string): Promise<boolean> {
  const found = new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: join(root, dir) });
  for await (const path of found) {
    if (path.split(sep).some((part) => UNREAD_FOLDERS.has(part))) continue;
    if (!isEmptyFile(await readFile(join(root, dir, path), "utf8")))
      return false;
  }
  return true;
}

/** The package table: a row per workspace, planned while it is an empty entry. */
export async function checkStatus(
  root: string,
  source: string,
  add: Add,
): Promise<void> {
  const lines = readLines(source);
  const header = lines.findIndex(isHeader);
  if (header === -1) {
    add(1, "needs the package table, headed Package | Layer");
    return;
  }
  const dirs = await workspaceDirs(root);
  const listed = new Set<string>();
  for (const line of lines.slice(header + 2)) {
    if (!line.text.startsWith("|")) break;
    const row = readRow(line.text);
    const dir = row === null ? undefined : dirs.get(row.name);
    if (row === null)
      add(
        line.n,
        "must begin with a workspace in backticks and end with **built**, **in progress**, **planned**",
      );
    else if (dir === undefined)
      add(line.n, `names ${row.name}, which is not a workspace`);
    else if (listed.has(row.name)) add(line.n, `lists ${row.name} twice`);
    else {
      listed.add(row.name);
      await checkRow(root, row, dir, line.n, add);
    }
  }
  for (const name of [...dirs.keys()].toSorted())
    if (!listed.has(name))
      add(header + 1, `the package table lacks a row for ${name}`);
}

/** Planned holds no code, and built is more than an empty entry; in progress may be either. */
async function checkRow(
  root: string,
  row: Row,
  dir: string,
  n: number,
  add: Add,
): Promise<void> {
  if (row.status === "in progress") return;
  const empty = await isEmptyEntry(root, dir);
  if (row.status === "planned" && !empty)
    add(n, `marks ${row.name} planned, but ${dir} holds code`);
  if (row.status === "built" && empty)
    add(n, `marks ${row.name} built, but ${dir} is an empty entry`);
}
