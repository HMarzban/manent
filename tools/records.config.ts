// What the public documents must look like. Read by tools/check-records.ts.
import { UCD_DIR, UCD_SHA256 } from "./unicode/generate-tables.ts";

export const CHANGELOG = "CHANGELOG.md";
export const AGENTS = "AGENTS.md";
export const README = "README.md";
export const DECISIONS_DIR = "docs/decisions";
export const DECISIONS_INDEX = "docs/decisions/README.md";
export const LESSONS = "docs/memory/lessons.md";
export const MEMORY_DIR = "docs/memory";
export const ARCHITECTURE_DIR = "docs/architecture";
export const BENCHMARK_DIR = "docs/benchmark";
export const OVERVIEW = "docs/architecture/overview.md";

/** Public documents outside the folders below; each is read when it exists. */
export const PUBLIC_FILES = [
  AGENTS,
  CHANGELOG,
  README,
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "docs/README.md",
] as const;

/** A finding when one is absent. */
export const REQUIRED_FILES = [
  AGENTS,
  CHANGELOG,
  README,
  DECISIONS_INDEX,
  LESSONS,
  OVERVIEW,
] as const;

/** Every Markdown file in these folders is a public document; a folder that does not exist holds none. */
export const PUBLIC_DIRS = [
  ARCHITECTURE_DIR,
  BENCHMARK_DIR,
  DECISIONS_DIR,
  "docs/development",
  "docs/guide",
  MEMORY_DIR,
] as const;

/** Keep a Changelog's groups. */
export const CHANGE_GROUPS = [
  "Added",
  "Changed",
  "Deprecated",
  "Removed",
  "Fixed",
  "Security",
] as const;

export const DECISION_SECTIONS = [
  "Context",
  "Options considered",
  "Decision",
  "Consequences and trade-offs",
  "Revisit when",
] as const;

/** A decision is attributed to a role, never to a person. */
export const DECIDERS = [
  "project owner",
  "engineering lead",
  "project owner and engineering lead",
] as const;

export const LESSON_PARTS = [
  "What happened",
  "How it was caught",
  "Rule",
  "Enforced by",
] as const;

/** Two minutes of reading. */
export const AGENTS_MAX_WORDS = 600;
export const AGENTS_GATE = "bun run verify";
export const AGENTS_LINKS = [CHANGELOG, DECISIONS_INDEX, LESSONS] as const;

/** The licence: LICENSE holds the terms, NOTICE the copyright line, and only the README points to them. */
export const LICENSE_FILE = "LICENSE";
export const NOTICE_FILE = "NOTICE";
/** SHA-256 of the licence: the whole file, its lines joined by "\n", trailing space trimmed. */
export const LICENSE_SHA256 =
  "58d1e17ffe5109a7ae296caafcadfdbe6a7d176f0bc4ab01e12a689b0499d8bd";
/** A document other than the README that names the licence restates it. */
export const LICENSE_WORD = new RegExp(
  String.raw`apache license|apache-2\.0`,
  "i",
);

/**
 * The README's two fixed sections. Their text is recorded, so only there may a word of the local
 * term list, an email address or a profile link stand: the acknowledgement and the contact line.
 */
export const README_SECTIONS = ["Acknowledgement", "Licence"] as const;
export type ReadmeSection = (typeof README_SECTIONS)[number];
/** SHA-256 of each section's text: the lines between its heading and the next "## " heading, joined by "\n", trimmed. */
export const README_SECTION_SHA256: Readonly<Record<ReadmeSection, string>> = {
  Acknowledgement:
    "3f1e989d21663c947be512837e383e274e0c42c88ad3b525435bd95f5a149de8",
  Licence: "6827c8aba9665b0d0ffe837364ce02f3c431173d2beed31898f1777c77e42db4",
};

/** The package table in the overview: a row per workspace, ending in one of these. */
export const STATUS_HEADER = ["Package", "Layer"] as const;
export const STATUSES = ["built", "in progress", "planned"] as const;
export const EMPTY_ENTRY = "export {};";

/** A record stands on its own: no section numbers, no working notes. */
export const SECTION_REF = new RegExp(String.raw`§|\bsections?\s+\d`, "i");
export const NOTE_REF = new RegExp(
  String.raw`\bthe design\b(?!\s+(?:system|tokens?)\b)|\bthe spec\b|\b(?:plan|task|spike)\s+#?\d`,
  "i",
);
/** An address such as name@example.org; a version such as bun@1.4.4 is not one. */
export const EMAIL = new RegExp(
  String.raw`[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b`,
  "i",
);
/** A link to a profile on a code host, as opposed to a repository there. */
export const PROFILE_LINK = new RegExp(
  String.raw`https?://(?:www\.)?(?:github|gitlab)\.com/[\w-]+/?(?![\w/-])`,
  "i",
);
export const HOME_PATH = new RegExp(
  String.raw`(?<![\w.])(?:/Users/|/home/)[^\s/]+|[A-Za-z]:\\Users\\[^\s\\]+`,
);

/** Written as strings: the boundary scanner cannot read a pattern literal that holds a backtick. */
export const FENCE = new RegExp("^\\s*(```|~~~)");
export const CODE_SPAN = new RegExp("`([^`]+)`", "g");

/** Kept beside git's own local exclude file; never tracked. */
export const LOCAL_TERMS_FILE = "info/records-private-terms";
/** How a violation names that list. */
export const LOCAL_TERMS_NAME = ".git/info/records-private-terms";
/**
 * Tracked files whose words are not scanned: the licence is pinned by its SHA-256, the notice
 * names its holder, the lockfile is generated, and the Unicode data is vendored unmodified and
 * pinned by its SHA-256.
 */
export const UNSCANNED: readonly string[] = [
  LICENSE_FILE,
  NOTICE_FILE,
  "bun.lock",
  ...Object.keys(UCD_SHA256).map((name) => `${UCD_DIR}/${name}`),
];
/** A larger tracked file is not read as text. */
export const SCAN_LIMIT_BYTES = 1024 * 1024;
export const LOCAL_EXCLUDE_FILE = "info/exclude";
