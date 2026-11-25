// Client-side search query parsing, operator insertion/replacement, date presets, and excerpt highlighting.

export const SEARCHABLE_DOC_KINDS = [
  "script",
  "outline",
  "ink",
  "room_log",
  "rundown",
] as const;
export type SearchableDocKind = (typeof SEARCHABLE_DOC_KINDS)[number];

export const SEARCHABLE_PROJECT_KINDS = [
  "film",
  "series",
  "show",
  "news",
  "podcast",
  "book",
  "game",
  "stage_play",
] as const;
export type SearchableProjectKind = (typeof SEARCHABLE_PROJECT_KINDS)[number];

export type ChangedPreset = "today" | "last7" | "last30" | "thisYear";
export type FilterOperatorName = "type" | "after" | "folder";

const KNOWN_OPERATORS: readonly string[] = [
  "type",
  "after",
  "before",
  "folder",
];
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TOKEN_PATTERN = new RegExp("[\\p{L}\\p{N}\\p{M}]+", "gu");
const COMBINING_MARKS = new RegExp("\\p{M}+", "gu");

interface RawSpan {
  readonly kind: "phrase" | "word" | "op";
  readonly name?: string;
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

export interface ParsedClientQuery {
  readonly words: readonly string[];
  readonly phrases: readonly string[];
  readonly kinds: readonly SearchableDocKind[];
  readonly projectKinds: readonly SearchableProjectKind[];
  readonly folderNames: readonly string[];
  readonly hasFilterOperator: boolean;
  readonly unsatisfiable: boolean;
  readonly activeType: string | null;
  readonly activeAfter: string | null;
  readonly activeFolder: string | null;
}

export interface ExcerptRun {
  readonly text: string;
  readonly matched: boolean;
}

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function readQuoted(
  input: string,
  start: number,
): { text: string; next: number } {
  let i = start + 1;
  while (i < input.length && input[i] !== '"') i += 1;
  const text = input.slice(start + 1, i);
  return { text, next: i < input.length ? i + 1 : i };
}

function tokenizeSpans(raw: string): RawSpan[] {
  const spans: RawSpan[] = [];
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && isSpace(raw[i]!)) i += 1;
    if (i >= raw.length) break;
    const start = i;
    if (raw[i] === '"') {
      const { text, next } = readQuoted(raw, i);
      spans.push({ kind: "phrase", value: text, start, end: next });
      i = next;
      continue;
    }
    while (i < raw.length && !isSpace(raw[i]!) && raw[i] !== '"') i += 1;
    const head = raw.slice(start, i);
    const colon = head.indexOf(":");
    if (colon > 0) {
      const prefix = head.slice(0, colon).toLowerCase();
      if (KNOWN_OPERATORS.includes(prefix)) {
        const rest = head.slice(colon + 1);
        if (rest.length === 0 && i < raw.length && raw[i] === '"') {
          const { text, next } = readQuoted(raw, i);
          spans.push({
            kind: "op",
            name: prefix,
            value: text,
            start,
            end: next,
          });
          i = next;
        } else {
          spans.push({ kind: "op", name: prefix, value: rest, start, end: i });
        }
        continue;
      }
    }
    if (i < raw.length && raw[i] === '"') {
      const { text, next } = readQuoted(raw, i);
      spans.push({ kind: "word", value: `${head}${text}`, start, end: next });
      i = next;
      continue;
    }
    spans.push({ kind: "word", value: head, start, end: i });
  }
  return spans;
}

function isValidYmd(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (match === null) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() + 1 === m &&
    check.getUTCDate() === d
  );
}

/** Parses a search query for filter state, offline matching, and unreadable-operator detection. */
export function parseClientQuery(raw: string): ParsedClientQuery {
  const words: string[] = [];
  const phrases: string[] = [];
  const kinds: SearchableDocKind[] = [];
  const projectKinds: SearchableProjectKind[] = [];
  const folderNames: string[] = [];
  let hasFilterOperator = false;
  let unsatisfiable = false;
  let activeType: string | null = null;
  let activeAfter: string | null = null;
  let activeFolder: string | null = null;

  for (const span of tokenizeSpans(raw)) {
    if (span.kind === "word") {
      words.push(span.value);
      continue;
    }
    if (span.kind === "phrase") {
      const trimmed = span.value.trim();
      if (trimmed.length > 0) phrases.push(trimmed);
      else unsatisfiable = true;
      continue;
    }
    hasFilterOperator = true;
    const val = span.value.trim();
    if (val.length === 0) {
      unsatisfiable = true;
      continue;
    }
    if (span.name === "type") {
      const lower = val.toLowerCase();
      const docKind = SEARCHABLE_DOC_KINDS.find((k) => k === lower);
      const projKind = SEARCHABLE_PROJECT_KINDS.find((k) => k === lower);
      if (docKind !== undefined) {
        if (kinds.length > 0 && !kinds.includes(docKind)) unsatisfiable = true;
        else if (!kinds.includes(docKind)) kinds.push(docKind);
        activeType = docKind;
      } else if (projKind !== undefined) {
        if (projectKinds.length > 0 && !projectKinds.includes(projKind))
          unsatisfiable = true;
        else if (!projectKinds.includes(projKind)) projectKinds.push(projKind);
        activeType = projKind;
      } else {
        unsatisfiable = true;
      }
      continue;
    }
    if (span.name === "after" || span.name === "before") {
      if (!isValidYmd(val)) unsatisfiable = true;
      else if (span.name === "after") activeAfter = val;
      continue;
    }
    if (span.name === "folder") {
      folderNames.push(val);
      activeFolder = val;
    }
  }

  return {
    words,
    phrases,
    kinds,
    projectKinds,
    folderNames,
    hasFilterOperator,
    unsatisfiable,
    activeType,
    activeAfter,
    activeFolder,
  };
}

/** Inserts, replaces, or removes `name:<value>` in `raw`, keeping all other words and operators intact. */
export function setQueryOperator(
  raw: string,
  name: FilterOperatorName,
  value: string | null,
): string {
  const spans = tokenizeSpans(raw);
  const kept: string[] = [];
  for (const span of spans) {
    if (span.kind === "op" && span.name === name) continue;
    kept.push(raw.slice(span.start, span.end));
  }
  if (value !== null && value.trim() !== "") {
    const trimmed = value.trim();
    const formatted = /\s/.test(trimmed) ? `"${trimmed}"` : trimmed;
    kept.push(`${name}:${formatted}`);
  }
  return kept.join(" ");
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Computes the local `YYYY-MM-DD` date for a Changed filter preset. */
export function changedPresetDate(
  nowMs: number,
  preset: ChangedPreset,
): string {
  const now = new Date(nowMs);
  if (preset === "today") return formatYmd(now);
  if (preset === "thisYear") return `${now.getFullYear()}-01-01`;
  const days = preset === "last7" ? 7 : 30;
  return formatYmd(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - days),
  );
}

const normalize = (raw: string): string =>
  raw.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();

function extractTokens(
  text: string,
): { start: number; end: number; norm: string }[] {
  const out: { start: number; end: number; norm: string }[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const start = match.index;
    out.push({
      start,
      end: start + match[0].length,
      norm: normalize(match[0]),
    });
  }
  return out;
}

/** Splits `excerpt` into plain and matched runs for safe `<mark>` rendering. */
export function highlightExcerpt(
  excerpt: string,
  words: readonly string[],
  phrases: readonly string[],
): readonly ExcerptRun[] {
  const needles = [...phrases, ...words]
    .map((term) => extractTokens(term).map((t) => t.norm))
    .filter((seq) => seq.length > 0);
  if (needles.length === 0) return [{ text: excerpt, matched: false }];

  const tokens = extractTokens(excerpt);
  const ranges: [number, number][] = [];
  for (const needle of needles) {
    const limit = tokens.length - needle.length;
    for (let i = 0; i <= limit; i++) {
      let ok = true;
      for (let j = 0; j < needle.length; j++) {
        if (tokens[i + j]!.norm !== needle[j]) {
          ok = false;
          break;
        }
      }
      if (ok)
        ranges.push([tokens[i]!.start, tokens[i + needle.length - 1]!.end]);
    }
  }
  if (ranges.length === 0) return [{ text: excerpt, matched: false }];

  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const [start, end] of ranges) {
    const prev = merged.at(-1);
    if (prev !== undefined && start <= prev[1])
      prev[1] = Math.max(prev[1], end);
    else merged.push([start, end]);
  }

  const runs: ExcerptRun[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor)
      runs.push({ text: excerpt.slice(cursor, start), matched: false });
    runs.push({ text: excerpt.slice(start, end), matched: true });
    cursor = end;
  }
  if (cursor < excerpt.length)
    runs.push({ text: excerpt.slice(cursor), matched: false });
  return runs;
}
