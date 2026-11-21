// What a public document may not cite or link, and what this machine keeps out of every tracked file.
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, posix, resolve } from "node:path";
import { untrackable } from "./check-tracked.ts";
import type { LocalRules, Rule, Violation } from "./check-records.ts";
import { readLines } from "./records-format.ts";
import { fixedLines } from "./records-status.ts";
import {
  CODE_SPAN,
  EMAIL,
  HOME_PATH,
  LOCAL_EXCLUDE_FILE,
  LOCAL_TERMS_FILE,
  LOCAL_TERMS_NAME,
  NOTE_REF,
  NOTICE_COPYRIGHT,
  NOTICE_FILE,
  PRODUCT_PAGE,
  PROFILE_LINK,
  README,
  SCAN_LIMIT_BYTES,
  SECTION_REF,
  SITE_PAGE,
  UNSCANNED,
} from "./records.config.ts";

type Hit = Omit<Violation, "file" | "line">;

interface PatternRule {
  rule: Rule;
  pattern: RegExp;
  message: (match: string) => string;
}

/** Read on every line of a public document. */
const EVERY_LINE: readonly PatternRule[] = [
  {
    rule: "section-ref",
    pattern: SECTION_REF,
    message: (match) =>
      `cites a section number ("${match}"); say what it says instead`,
  },
  {
    rule: "note-ref",
    pattern: NOTE_REF,
    message: (match) =>
      `cites working notes ("${match}"); a record stands on its own`,
  },
  {
    rule: "home-path",
    pattern: HOME_PATH,
    message: (match) => `names a path in a home directory (${match})`,
  },
];

/** Not read inside the README's two fixed sections, whose text is recorded. */
const OPEN_LINE: readonly PatternRule[] = [
  {
    rule: "email",
    pattern: EMAIL,
    message: (match) => `holds an email address (${match})`,
  },
  {
    rule: "profile-link",
    pattern: PROFILE_LINK,
    message: (match) =>
      `links to a profile (${match}); only the README's contact line does`,
  },
];

const LINK = /\]\(([^)\s]+)\)/g;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const EXCLUDE_PATTERN = /[*?[]/;
const COLUMN_HEADING = /<th\b[^>]*\bscope="col"[^>]*>([^<]*)/g;
const LEFT_OUT_LIST = /<ul\b[^>]*\bclass="left-out"[^>]*>([\s\S]*?)<\/ul>/g;
const LEFT_OUT_LEAD = /<li\b[^>]*>([^:<]*)/g;

/** The literal paths of a git exclude file, first seen first; patterns and negations are not paths. */
export function parseExclude(text: string): string[] {
  const paths = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("!")) continue;
    if (EXCLUDE_PATTERN.test(line)) continue;
    const path = line.replace(/^\//, "");
    const bare = path.replace(/\/$/, "");
    paths.add(bare.includes("/") || bare.startsWith(".") ? bare : path);
  }
  return [...paths];
}

/** One pattern per line, matched without regard to case; a line that does not compile is a violation. */
export function parseTermList(text: string): {
  terms: RegExp[];
  violations: Violation[];
} {
  const terms: RegExp[] = [];
  const violations: Violation[] = [];
  const listed = (line: number, message: string) =>
    violations.push({
      file: LOCAL_TERMS_NAME,
      line,
      rule: "local-list",
      message,
    });
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    try {
      terms.push(new RegExp(line, "i"));
    } catch {
      listed(i + 1, "is not a valid pattern");
    }
  }
  if (terms.length === 0 && violations.length === 0) listed(1, "has no terms");
  return { terms, violations };
}

async function gitOutput(root: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "ignore",
  });
  const out = await new Response(proc.stdout).text();
  return (await proc.exited) === 0 ? out : "";
}

/** The text of the file at `path`, or null when there is none. */
export const readIfPresent = async (path: string): Promise<string | null> =>
  existsSync(path) ? await readFile(path, "utf8") : null;

/** This machine's private paths and terms, and the files git tracks or would track; none outside a git checkout. */
export async function loadLocalRules(root: string): Promise<LocalRules> {
  const gitDir = (
    await gitOutput(root, ["rev-parse", "--git-common-dir"])
  ).trim();
  if (gitDir === "")
    return { paths: [], terms: [], violations: [], files: null };
  const common = resolve(root, gitDir);
  // A listing that cannot be read leaves the set empty, so every relative link reads as untracked.
  const listing = await gitOutput(root, [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ]);
  const exclude = await readIfPresent(join(common, LOCAL_EXCLUDE_FILE));
  const termList = await readIfPresent(join(common, LOCAL_TERMS_FILE));
  const { terms, violations } =
    termList === null ? { terms: [], violations: [] } : parseTermList(termList);
  return {
    paths: exclude === null ? [] : parseExclude(exclude),
    terms,
    violations,
    files: new Set(listing.split("\0").filter((path) => path !== "")),
  };
}

function localPath(text: string, paths: readonly string[]): Hit | null {
  const lower = text.toLowerCase();
  const path = paths.find((candidate) =>
    lower.includes(candidate.toLowerCase()),
  );
  return path === undefined
    ? null
    : {
        rule: "private-path",
        message: `names ${path}, which this machine keeps out of the repository`,
      };
}

function localTerm(text: string, terms: readonly RegExp[]): Hit | null {
  for (const term of terms) {
    const match = term.exec(text)?.[0];
    if (match !== undefined)
      return {
        rule: "private-term",
        message: `uses "${match}", which is on this machine's private list`,
      };
  }
  return null;
}

const isTrackedFolder = (path: string, files: ReadonlySet<string>): boolean => {
  const folder = path.endsWith("/") ? path : `${path}/`;
  return [...files].some((file) => file.startsWith(folder));
};

/** Why a repository-relative link target cannot be followed by a reader, or null. */
function unreachable(
  root: string,
  path: string,
  files: ReadonlySet<string> | null,
): string | null {
  if (path.startsWith("..") || untrackable([path]).length > 0)
    return "is outside the public tree";
  if (!existsSync(join(root, path))) return "does not exist";
  if (files !== null && !files.has(path) && !isTrackedFolder(path, files))
    return "git does not track";
  return null;
}

/** The first relative link of the line, outside code spans, that a reader cannot follow. */
function linkHit(
  root: string,
  file: string,
  text: string,
  files: ReadonlySet<string> | null,
): Hit | null {
  for (const [, link = ""] of text.replace(CODE_SPAN, "").matchAll(LINK)) {
    const target = link.split("#")[0] ?? "";
    if (target === "" || SCHEME.test(target)) continue;
    const path = posix.normalize(posix.join(posix.dirname(file), target));
    const reason = unreachable(root, path, files);
    if (reason !== null)
      return { rule: "link", message: `links to ${target}, which ${reason}` };
  }
  return null;
}

function patternHits(text: string, rules: readonly PatternRule[]): Hit[] {
  return rules.flatMap(({ rule, pattern, message }) => {
    const match = pattern.exec(text)?.[0];
    return match === undefined ? [] : [{ rule, message: message(match) }];
  });
}

/** The citation, link and local rules over one public document. */
export function scanPrivacy(
  root: string,
  file: string,
  text: string,
  local: LocalRules,
): Violation[] {
  const fixed = file === README ? fixedLines(text) : new Set<number>();
  return readLines(text).flatMap((line) => {
    const open = !fixed.has(line.n);
    const hits = [
      ...patternHits(line.text, EVERY_LINE),
      ...(open ? patternHits(line.text, OPEN_LINE) : []),
      line.code ? null : linkHit(root, file, line.text, local.files),
      localPath(line.text, local.paths),
      open ? localTerm(line.text, local.terms) : null,
    ];
    return hits.flatMap((hit) =>
      hit === null ? [] : [{ file, line: line.n, ...hit }],
    );
  });
}

/** The text of a file worth reading for words, or null: absent, too large or binary. */
async function readScannable(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  const info = await stat(path);
  if (!info.isFile() || info.size > SCAN_LIMIT_BYTES) return null;
  const bytes = await readFile(path);
  return bytes.includes(0) ? null : bytes.toString("utf8");
}

/** The names the product page lists: its column headings, and what leads each item of its left-out list. */
function productNames(page: string): string[] {
  const leads = [...page.matchAll(LEFT_OUT_LIST)].flatMap(([, list = ""]) => [
    ...list.matchAll(LEFT_OUT_LEAD),
  ]);
  return [...page.matchAll(COLUMN_HEADING), ...leads].map(([, name = ""]) =>
    name.trim(),
  );
}

/** The local terms the product page may not hold: those that name none of its products, and those the README's fixed sections hold. */
function productPageTerms(
  page: string,
  terms: readonly RegExp[],
  readme = "",
): RegExp[] {
  const names = productNames(page);
  const fixed = fixedLines(readme);
  const reserved = readLines(readme)
    .filter((line) => fixed.has(line.n))
    .map((line) => line.text)
    .join("\n");
  return terms.filter(
    (term) => term.test(reserved) || !names.some((name) => term.test(name)),
  );
}

/** The footer line a site page may name the copyright holder in, and the holder, from NOTICE's second line. */
function copyrightFooter(
  notice: string | null,
): { line: string; holder: string } | null {
  const [, year, holder] =
    NOTICE_COPYRIGHT.exec(notice?.split(/\r?\n/)[1]?.trim() ?? "") ?? [];
  return year === undefined || holder === undefined
    ? null
    : { line: `© ${year} ${holder}`, holder };
}

/** The two local rules over every tracked file that is not one of the public `documents`. */
export async function scanTracked(
  root: string,
  local: LocalRules,
  documents: ReadonlyMap<string, string>,
): Promise<Violation[]> {
  const { files, paths, terms } = local;
  if (files === null || (paths.length === 0 && terms.length === 0)) return [];
  const footer = copyrightFooter(await readIfPresent(join(root, NOTICE_FILE)));
  const found: Violation[] = [];
  for (const file of [...files].toSorted()) {
    if (documents.has(file) || UNSCANNED.includes(file)) continue;
    const text = await readScannable(join(root, file));
    if (text === null) continue;
    const barred =
      file === PRODUCT_PAGE
        ? productPageTerms(text, terms, documents.get(README))
        : terms;
    const atFooter =
      footer !== null && SITE_PAGE.test(file)
        ? barred.filter((term) => !term.test(footer.holder))
        : barred;
    for (const [i, line] of text.split(/\r?\n/).entries()) {
      const lineTerms = line.trim() === footer?.line ? atFooter : barred;
      for (const hit of [localPath(line, paths), localTerm(line, lineTerms)])
        if (hit !== null) found.push({ file, line: i + 1, ...hit });
    }
  }
  return found;
}
