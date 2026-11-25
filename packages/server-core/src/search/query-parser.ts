// Search query parser: bare words, phrases, type/date/folder operators, and IANA time-zone day bounds.
import type { DocKind } from "@manent/sync-protocol";

const SEARCHABLE_DOC_KINDS: readonly DocKind[] = Object.freeze([
  "script",
  "outline",
  "ink",
  "room_log",
  "rundown",
]);

const PROJECT_KINDS: readonly string[] = Object.freeze([
  "film",
  "series",
  "show",
  "news",
  "podcast",
  "book",
  "game",
  "stage_play",
]);

const KNOWN_OPERATORS: readonly string[] = Object.freeze([
  "type",
  "after",
  "before",
  "folder",
]);

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface ParsedSearchQuery {
  /** True when any known operator carried an unreadable value or mutually exclusive filters conflict. */
  readonly unsatisfiable: boolean;
  readonly words: readonly string[];
  readonly phrases: readonly string[];
  readonly kinds: readonly DocKind[];
  readonly projectKinds: readonly string[];
  readonly folderNames: readonly string[];
  /** Inclusive lower bound on `changedAt` in epoch ms; null when absent. */
  readonly afterAt: number | null;
  /** Inclusive upper bound on `changedAt` in epoch ms; null when absent. */
  readonly beforeAt: number | null;
}

type RawToken =
  | { readonly kind: "phrase"; readonly value: string }
  | { readonly kind: "word"; readonly value: string }
  | { readonly kind: "op"; readonly name: string; readonly value: string };

function isWhitespace(ch: string): boolean {
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

function tokenizeQuery(raw: string): RawToken[] {
  const tokens: RawToken[] = [];
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && isWhitespace(raw[i]!)) i += 1;
    if (i >= raw.length) break;
    if (raw[i] === '"') {
      const { text, next } = readQuoted(raw, i);
      tokens.push({ kind: "phrase", value: text });
      i = next;
      continue;
    }
    const start = i;
    while (i < raw.length && !isWhitespace(raw[i]!) && raw[i] !== '"') i += 1;
    const head = raw.slice(start, i);
    const colon = head.indexOf(":");
    if (colon > 0) {
      const prefix = head.slice(0, colon).toLowerCase();
      if (KNOWN_OPERATORS.includes(prefix)) {
        const rest = head.slice(colon + 1);
        if (rest.length === 0 && i < raw.length && raw[i] === '"') {
          const { text, next } = readQuoted(raw, i);
          tokens.push({ kind: "op", name: prefix, value: text });
          i = next;
        } else {
          tokens.push({ kind: "op", name: prefix, value: rest });
        }
        continue;
      }
    }
    if (i < raw.length && raw[i] === '"') {
      const { text, next } = readQuoted(raw, i);
      tokens.push({ kind: "word", value: `${head}${text}` });
      i = next;
      continue;
    }
    tokens.push({ kind: "word", value: head });
  }
  return tokens;
}

function resolveTimeZone(tz: string | null | undefined): string {
  if (tz === undefined || tz === null || tz.trim().length === 0) return "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions()
      .timeZone;
  } catch {
    // invalid IANA zone falls back to UTC
    return "UTC";
  }
}

function parseYmd(value: string): { y: number; m: number; d: number } | null {
  const match = DATE_PATTERN.exec(value);
  if (match === null) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() + 1 !== m ||
    check.getUTCDate() !== d
  )
    return null;
  return { y, m, d };
}

function partsInZone(epochMs: number, formatter: Intl.DateTimeFormat): number {
  const parts = formatter.formatToParts(new Date(epochMs));
  const num = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = num("hour") % 24;
  return Date.UTC(
    num("year"),
    num("month") - 1,
    num("day"),
    hour,
    num("minute"),
    num("second"),
  );
}

/** Epoch ms for local wall-clock 00:00:00.000 of `(y, m, d)` in IANA zone `tz`. */
function startOfDayInZone(y: number, m: number, d: number, tz: string): number {
  const target = Date.UTC(y, m - 1, d);
  if (tz === "UTC") return target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const rendered = partsInZone(guess, formatter);
    guess += target - rendered;
  }
  return guess;
}

function dayBounds(
  value: string,
  tz: string,
): { start: number; end: number } | null {
  const parsed = parseYmd(value);
  if (parsed === null) return null;
  const { y, m, d } = parsed;
  const start = startOfDayInZone(y, m, d, tz);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextStart = startOfDayInZone(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    tz,
  );
  return { start, end: nextStart - 1 };
}

/** Parses a user search string into text terms and structured filters, applying `tz` (default UTC) to date filters. */
export function parseSearchQuery(
  raw: string,
  tz?: string | null,
): ParsedSearchQuery {
  const zone = resolveTimeZone(tz);
  const words: string[] = [];
  const phrases: string[] = [];
  const kinds: DocKind[] = [];
  const projectKinds: string[] = [];
  const folderNames: string[] = [];
  let afterAt: number | null = null;
  let beforeAt: number | null = null;
  let unsatisfiable = false;

  for (const token of tokenizeQuery(raw)) {
    if (token.kind === "word") {
      words.push(token.value);
      continue;
    }
    if (token.kind === "phrase") {
      const trimmed = token.value.trim();
      if (trimmed.length > 0) phrases.push(trimmed);
      else unsatisfiable = true;
      continue;
    }
    const val = token.value.trim();
    if (val.length === 0) {
      unsatisfiable = true;
      continue;
    }
    if (token.name === "type") {
      const lower = val.toLowerCase();
      const docKind = SEARCHABLE_DOC_KINDS.find((k) => k === lower);
      if (docKind !== undefined) {
        if (kinds.length > 0 && !kinds.includes(docKind)) unsatisfiable = true;
        else if (!kinds.includes(docKind)) kinds.push(docKind);
      } else if (PROJECT_KINDS.includes(lower)) {
        if (projectKinds.length > 0 && !projectKinds.includes(lower))
          unsatisfiable = true;
        else if (!projectKinds.includes(lower)) projectKinds.push(lower);
      } else {
        unsatisfiable = true;
      }
      continue;
    }
    if (token.name === "after" || token.name === "before") {
      const bounds = dayBounds(val, zone);
      if (bounds === null) {
        unsatisfiable = true;
      } else if (token.name === "after") {
        afterAt =
          afterAt === null ? bounds.start : Math.max(afterAt, bounds.start);
      } else {
        beforeAt =
          beforeAt === null ? bounds.end : Math.min(beforeAt, bounds.end);
      }
      continue;
    }
    if (token.name === "folder") {
      folderNames.push(val);
    }
  }

  if (afterAt !== null && beforeAt !== null && afterAt > beforeAt)
    unsatisfiable = true;

  return {
    unsatisfiable,
    words,
    phrases,
    kinds,
    projectKinds,
    folderNames,
    afterAt,
    beforeAt,
  };
}
