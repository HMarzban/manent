// Unicode61-aligned tokenisation, safe FTS5 query construction, and body excerpt extraction.

const TOKEN_PATTERN = new RegExp("[\\p{L}\\p{N}\\p{M}]+", "gu");
const COMBINING_MARKS = new RegExp("\\p{M}+", "gu");
const WHITESPACE_RUN = new RegExp("\\s+", "g");

const EXCERPT_BEFORE = 60;
const EXCERPT_AFTER = 100;

export interface TextToken {
  readonly raw: string;
  readonly norm: string;
  readonly start: number;
  readonly end: number;
}

export type FtsQueryPlan =
  | { readonly kind: "none" }
  | { readonly kind: "impossible" }
  | { readonly kind: "match"; readonly match: string };

const normalizeToken = (raw: string): string =>
  raw.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();

/** Splits text into unicode61-style word tokens with byte-safe UTF-16 spans and folded forms. */
export function tokenize(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const raw = match[0];
    const start = match.index;
    tokens.push({
      raw,
      norm: normalizeToken(raw),
      start,
      end: start + raw.length,
    });
  }
  return tokens;
}

/**
 * Builds a safe FTS5 MATCH expression requiring every word and phrase (AND semantics).
 * Every term is tokenised and double-quoted so punctuation and FTS5 operators never cause syntax faults.
 */
export function buildFtsQuery(
  words: readonly string[],
  phrases: readonly string[],
): FtsQueryPlan {
  if (words.length === 0 && phrases.length === 0) return { kind: "none" };
  const parts: string[] = [];
  for (const term of [...words, ...phrases]) {
    const tokens = tokenize(term);
    if (tokens.length === 0) return { kind: "impossible" };
    const quoted = tokens.map((token) => token.raw).join(" ");
    parts.push(`"${quoted}"`);
  }
  return { kind: "match", match: parts.join(" AND ") };
}

function findSequence(
  haystack: readonly TextToken[],
  needle: readonly string[],
): { start: number; end: number } | null {
  if (needle.length === 0 || needle.length > haystack.length) return null;
  const limit = haystack.length - needle.length;
  for (let i = 0; i <= limit; i++) {
    let matched = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j]!.norm !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return {
        start: haystack[i]!.start,
        end: haystack[i + needle.length - 1]!.end,
      };
    }
  }
  return null;
}

function firstMatchSpan(
  text: string,
  needles: readonly (readonly string[])[],
): { start: number; end: number } | null {
  if (text.length === 0 || needles.length === 0) return null;
  const tokens = tokenize(text);
  let best: { start: number; end: number } | null = null;
  for (const needle of needles) {
    const found = findSequence(tokens, needle);
    if (found === null) continue;
    if (best === null || found.start < best.start) best = found;
  }
  return best;
}

function snapStart(text: string, target: number): number {
  if (target <= 0) return 0;
  let pos = target;
  while (pos > 0 && !/\s/.test(text[pos - 1]!)) pos--;
  while (pos < text.length && /\s/.test(text[pos]!)) pos++;
  return pos;
}

function snapEnd(text: string, target: number): number {
  if (target >= text.length) return text.length;
  let pos = target;
  while (pos < text.length && !/\s/.test(text[pos]!)) pos++;
  return pos;
}

function formatSnippet(
  text: string,
  span: { start: number; end: number },
): string {
  const rawStart = Math.max(0, span.start - EXCERPT_BEFORE);
  const rawEnd = Math.min(text.length, span.end + EXCERPT_AFTER);
  const start = snapStart(text, rawStart);
  const end = snapEnd(text, rawEnd);
  const slice = text.slice(start, end).replace(WHITESPACE_RUN, " ").trim();
  const cutLeft = text.slice(0, start).trim().length > 0;
  const cutRight = text.slice(end).trim().length > 0;
  return `${cutLeft ? "…" : ""}${slice}${cutRight ? "…" : ""}`;
}

/**
 * Extracts a snippet around the earliest matching word or phrase in body (or editorBody when provided for an editor).
 * Returns null when no text terms were given or the match lies outside the searched body text (title only).
 */
export function extractExcerpt(options: {
  readonly body: string;
  readonly editorBody: string | null;
  readonly words: readonly string[];
  readonly phrases: readonly string[];
}): string | null {
  const { body, editorBody, words, phrases } = options;
  const needles = [...words, ...phrases]
    .map((term) => tokenize(term).map((token) => token.norm))
    .filter((tokens) => tokens.length > 0);
  if (needles.length === 0) return null;
  const bodyMatch = firstMatchSpan(body, needles);
  if (bodyMatch !== null) return formatSnippet(body, bodyMatch);
  if (editorBody !== null) {
    const editorMatch = firstMatchSpan(editorBody, needles);
    if (editorMatch !== null) return formatSnippet(editorBody, editorMatch);
  }
  return null;
}
