// Where a sentence ends, for the rules that split a block only after one.

const BLANKS: ReadonlySet<string> = new Set([" ", "\t", "\n"]);
const CLOSING_QUOTES: ReadonlySet<string> = new Set(['"', "'", "”", "’"]);
const SENTENCE_ENDS: ReadonlySet<string> = new Set([".", "!", "?", "…"]);
/** Words a full stop follows without ending a sentence, in lower case. */
const ABBREVIATIONS: ReadonlySet<string> = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "vs",
  "etc",
  "lt",
  "sgt",
  "capt",
  "col",
  "gen",
  "rev",
  "inc",
  "ltd",
  "e.g",
  "i.e",
  "a.m",
  "p.m",
]);

const UPPER_A = 0x41;
const UPPER_Z = 0x5a;
const CASE_OFFSET = 0x20;

/** ASCII letters folded to lower case; everything else as it is. */
function asciiLower(word: string): string {
  let out = "";
  for (let at = 0; at < word.length; at++) {
    const unit = word.charCodeAt(at);
    out += String.fromCharCode(
      unit >= UPPER_A && unit <= UPPER_Z ? unit + CASE_OFFSET : unit,
    );
  }
  return out;
}

/**
 * Whether a line ends a sentence: after trailing blanks and closing quotes, it ends in `.`, `!`, `?`
 * or `…`, and a full stop does not follow a known abbreviation.
 */
export function endsSentence(line: string): boolean {
  let end = line.length;
  while (end > 0 && BLANKS.has(line[end - 1]!)) end--;
  while (end > 0 && CLOSING_QUOTES.has(line[end - 1]!)) end--;
  const last = line[end - 1];
  if (last === undefined || !SENTENCE_ENDS.has(last)) return false;
  if (last !== ".") return true;
  const start = line.lastIndexOf(" ", end - 2) + 1;
  return !ABBREVIATIONS.has(asciiLower(line.slice(start, end - 1)));
}
