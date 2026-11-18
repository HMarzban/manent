// Holds every interface string to the vocabulary: no banned or engineering word, no unlisted word, the right scope word,
// and, for each built feature, every one of its terms in use.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  BANNED_WORD_EXCEPTION,
  ENGINEERING_WORDS,
  NAMES,
  NOT_SENT_EXCEPTION,
  PENDING_TERMS,
  PLAIN_WORDS,
  TERMS,
} from "./glossary.ts";
import type { Feature } from "./glossary.ts";
import { findImports, mask } from "./source-scan.ts";

/** One interface string; a template literal's values read `{}`. `scope` says whether it speaks of the person's own choices, of a script everyone shares, or of neither. */
export interface StringSource {
  file: string;
  text: string;
  scope: "personal" | "shared" | "any";
}

type GlossaryRule =
  | "banned-word"
  | "unlisted-word"
  | "engineering-word"
  | "scope-word"
  | "unused-term";

/** One finding, in the shape of a boundary violation. `line` is 0: a string source carries no line. `word` is the offending word or term. */
export interface Violation {
  file: string;
  line: number;
  rule: GlossaryRule;
  message: string;
  word: string;
}

interface Phrase {
  words: readonly string[];
  banned: boolean;
}

// Letters and digits, joined by an apostrophe or a hyphen inside a word ("Can't", "re-applied").
const WORD = new RegExp(String.raw`[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*`, "gu");
const POSSESSIVE = new RegExp(String.raw`['’]s$`);
const PARAMETER = new RegExp(String.raw`\{[^{}]*\}`, "g");
const NUMBER = new RegExp(String.raw`^\d+[a-z]?$`);
const FUNCTION_KEY = new RegExp(String.raw`^f\d{1,2}$`);
const KEY_LABELS = new Set([
  "ctrl",
  "alt",
  "shift",
  "enter",
  "esc",
  "tab",
  "delete",
  "control-option",
]);
const NOT_SENT: Phrase = { words: ["not", "sent"], banned: true };
const SCOPE_WORDS: Readonly<Record<StringSource["scope"], string | null>> = {
  personal: "setting",
  shared: "preference",
  any: null,
};

/** A word as the vocabulary compares it: lower case, without a possessive "'s". */
const normal = (word: string): string =>
  word.toLowerCase().replace(POSSESSIVE, "");
const words = (text: string): string[] =>
  [...text.replace(PARAMETER, " ").matchAll(WORD)].map((m) => normal(m[0]));
/** Whether a word of a string is `listed`, or its plural. */
const isForm = (word: string, listed: string): boolean =>
  word === listed || word === `${listed}s` || word === `${listed}es`;

function buildVocabulary(): {
  phrases: readonly Phrase[];
  known: ReadonlySet<string>;
} {
  const named = [...TERMS.map((t) => t.term), ...NAMES];
  const allowed = [...named, ...TERMS.flatMap((t) => t.paletteOnly)];
  const namedWords = new Set(named.flatMap(words));
  const allowedPhrases = new Set(allowed.map((text) => words(text).join(" ")));
  // A never-called word is banned unless it is itself a listed term or name, or a word of one.
  const banned = TERMS.flatMap((t) => t.neverCalled).filter((text) => {
    const split = words(text);
    if (allowedPhrases.has(split.join(" "))) return false;
    return split.length > 1 || !namedWords.has(split[0] ?? "");
  });
  const phrases = [
    ...allowed.map((text) => ({ words: words(text), banned: false })),
    ...banned.map((text) => ({ words: words(text), banned: true })),
  ].toSorted((a, b) => b.words.length - a.words.length);
  const known = new Set([
    ...allowed.flatMap(words),
    ...PLAIN_WORDS,
    ...PENDING_TERMS,
  ]);
  return { phrases, known };
}

const VOCABULARY = buildVocabulary();

/** Whether `phrase` starts at `tokens[at]`: a banned phrase as it is written, any other also in the plural. */
const matchesAt = (
  tokens: readonly string[],
  at: number,
  phrase: Phrase,
): boolean =>
  phrase.words.length > 0 &&
  phrase.words.every((word, k) => {
    const token = tokens[at + k] ?? "";
    return phrase.banned ? token === word : isForm(token, word);
  });

/** A number, a key label, or a known word or the plural of one. */
const isKnown = (word: string): boolean =>
  NUMBER.test(word) ||
  FUNCTION_KEY.test(word) ||
  word.length === 1 ||
  KEY_LABELS.has(word) ||
  [word, word.replace(/s$/, ""), word.replace(/es$/, "")].some((form) =>
    VOCABULARY.known.has(form),
  );

/** Whether `text` is `template`, each `{…}` of the template standing for any value. */
function matchesTemplate(text: string, template: string): boolean {
  const parts = template
    .split(PARAMETER)
    .map((part) => part.replace(/[.*+?^$()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${parts.join(".+")}$`).test(text);
}

function checkOne(source: StringSource): Violation[] {
  const found: Violation[] = [];
  const report = (rule: GlossaryRule, word: string, message: string) =>
    found.push({ file: source.file, line: 0, rule, message, word });
  const tokens = words(source.text);
  const bannedAllowed = BANNED_WORD_EXCEPTION.some((t) =>
    matchesTemplate(source.text, t),
  );
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i] ?? "";
    if (ENGINEERING_WORDS.some((word) => isForm(token, word))) {
      report(
        "engineering-word",
        token,
        `"${source.text}" holds the engineering word "${token}"`,
      );
      i++;
      continue;
    }
    if (
      matchesAt(tokens, i, NOT_SENT) &&
      !NOT_SENT_EXCEPTION.some((t) => matchesTemplate(source.text, t))
    ) {
      report(
        "engineering-word",
        "not sent",
        `"${source.text}" says "not sent" outside its fixed sentences`,
      );
      i += NOT_SENT.words.length;
      continue;
    }
    const phrase = VOCABULARY.phrases.find((p) => matchesAt(tokens, i, p));
    if (phrase) {
      const said = tokens.slice(i, i + phrase.words.length).join(" ");
      if (phrase.banned && !bannedAllowed)
        report(
          "banned-word",
          said,
          `"${source.text}" holds "${said}", a word the interface never uses`,
        );
      i += phrase.words.length;
      continue;
    }
    if (!isKnown(token))
      report(
        "unlisted-word",
        token,
        `"${token}" in "${source.text}" is not a listed term, a name or a plain word`,
      );
    i++;
  }
  const scopeWord = SCOPE_WORDS[source.scope];
  if (scopeWord !== null)
    for (const token of tokens.filter((t) => isForm(t, scopeWord)))
      report(
        "scope-word",
        token,
        `"${source.text}" says "${token}" in a ${source.scope} string`,
      );
  return found;
}

/** The findings of every rule but the reverse one; empty when every string passes. Terms are matched longest first, case-insensitively, on word boundaries. */
export function checkStrings(strings: readonly StringSource[]): Violation[] {
  return strings.flatMap(checkOne);
}

/** For each feature in `builtFeatures`, a finding for each of its terms that no string uses. */
export function checkReverse(
  strings: readonly StringSource[],
  builtFeatures: readonly Feature[],
): Violation[] {
  const said = strings.map((source) => words(source.text));
  return TERMS.filter((term) => builtFeatures.includes(term.feature))
    .filter((term) => {
      const phrase = { words: words(term.term), banned: false };
      return !said.some((tokens) =>
        tokens.some((_, at) => matchesAt(tokens, at, phrase)),
      );
    })
    .map((term) => ({
      file: "tools/glossary.ts",
      line: 0,
      rule: "unused-term",
      message: `"${term.term}" (${term.feature}) is used by no interface string`,
      word: term.term,
    }));
}

const WORDS_DIR = "packages/ui/src/words";
const FILES = ["apps/web/src/text.ts", "apps/desktop/src/words.ts"];
// A literal with no space that starts with a lower-case letter is a value for code (an id, a union member, a locale), not text.
const CODE_VALUE = new RegExp(String.raw`^[a-z][^\s]*$`);
// A table's own keys sit at two spaces; a literal belongs to the nearest one above it.
const TABLE_KEY = new RegExp(String.raw`^ {2}([A-Za-z_$][\w$]*)\s*:`, "gm");
const SCOPES: Readonly<
  Record<
    string,
    Readonly<Record<string, StringSource["scope"]>> | StringSource["scope"]
  >
> = {
  "packages/ui/src/words/preferences.ts": "personal",
  "packages/ui/src/words/sync-centre.ts": "personal",
  "packages/ui/src/words/document.ts": {
    ownPreferences: "personal",
    scriptScopeLine: "shared",
    setBy: "shared",
    readOnlySettings: "shared",
  },
};

/** A template literal's text with each `${…}` read as `{}`. */
function staticParts(template: string): string {
  let out = "";
  let i = 0;
  while (i < template.length) {
    if (template[i] !== "$" || template[i + 1] !== "{") {
      out += template[i];
      i++;
      continue;
    }
    let depth = 1;
    i += 2;
    while (i < template.length && depth > 0) {
      if (template[i] === "{") depth++;
      if (template[i] === "}") depth--;
      i++;
    }
    out += "{}";
  }
  return out;
}

function stringsOf(file: string, source: string): StringSource[] {
  const masked = mask(source);
  const specifiers = new Set(findImports(masked).map((imp) => imp.specifier));
  const keys = [...masked.text.matchAll(TABLE_KEY)].map((m) => ({
    at: m.index,
    key: m[1] ?? "",
  }));
  const scopes = SCOPES[file] ?? "any";
  const scopeAt = (offset: number): StringSource["scope"] => {
    if (typeof scopes === "string") return scopes;
    const key = keys.findLast((k) => k.at < offset)?.key ?? "";
    return scopes[key] ?? "any";
  };
  return [...masked.strings]
    .filter(([, text]) => !specifiers.has(text) && !CODE_VALUE.test(text))
    .map(([offset, text]) => ({
      file,
      text: source[offset] === "`" ? staticParts(text) : text,
      scope: scopeAt(offset),
    }));
}

async function readIfPresent(path: string): Promise<string | null> {
  const file = Bun.file(path);
  return (await file.exists()) ? file.text() : null;
}

async function listIfPresent(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return [];
    throw error;
  }
}

/** The string literals of the interface's word tables and the web app's sentences, in file order; a missing file is skipped. */
export async function interfaceStrings(root: string): Promise<StringSource[]> {
  const listed = await listIfPresent(join(root, WORDS_DIR));
  const files = [
    ...listed
      .filter((name) => name.endsWith(".ts"))
      .toSorted()
      .map((name) => `${WORDS_DIR}/${name}`),
    ...FILES,
  ];
  const found: StringSource[] = [];
  for (const file of files) {
    const source = await readIfPresent(join(root, file));
    if (source !== null) found.push(...stringsOf(file, source));
  }
  return found;
}
