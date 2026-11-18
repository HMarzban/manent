// The one spelling in which documents are compared, hashed and stored.
import { fillBlockAttrs } from "./attrs.ts";
import type {
  BlockJSON,
  DocJSON,
  MarkJSON,
  SectionJSON,
  TextJSON,
} from "./json.ts";
import { MARK_NAMES, isMarkName } from "./marks.ts";
import { schema } from "./schema.ts";

/** Code-unit order, the same on every machine (no locale). */
function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** The keys of `given` that `known` lacks, by name; an undefined one is absent. */
function unknownEntries(
  given: Record<string, unknown>,
  known: Record<string, unknown>,
): [string, unknown][] {
  return Object.entries(given)
    .filter(([key, value]) => !Object.hasOwn(known, key) && value !== undefined)
    .toSorted(([a], [b]) => compareText(a, b));
}

function canonicalMark(mark: MarkJSON): MarkJSON {
  const given = mark.attrs ?? {};
  const known: Record<string, unknown> = isMarkName(mark.type)
    ? { ...schema.marks[mark.type].create(given).attrs }
    : {};
  const attrs = Object.fromEntries([
    ...Object.entries(known),
    ...unknownEntries(given, known),
  ]);
  return Object.keys(attrs).length === 0
    ? { type: mark.type }
    : { type: mark.type, attrs };
}

function markRank(mark: MarkJSON): number {
  return isMarkName(mark.type)
    ? MARK_NAMES.indexOf(mark.type)
    : MARK_NAMES.length;
}

/** Known marks in declared order, then unknown ones by name; one name by its attributes. */
function compareMarks(a: MarkJSON, b: MarkJSON): number {
  return (
    markRank(a) - markRank(b) ||
    compareText(a.type, b.type) ||
    compareText(JSON.stringify(a.attrs ?? {}), JSON.stringify(b.attrs ?? {}))
  );
}

function canonicalText(text: TextJSON): TextJSON {
  const marks = (text.marks ?? []).map(canonicalMark).toSorted(compareMarks);
  return marks.length === 0
    ? { type: "text", text: text.text }
    : { type: "text", text: text.text, marks };
}

/** Runs without text dropped, and neighbours with equal marks joined. */
function canonicalRuns(runs: readonly TextJSON[]): TextJSON[] {
  const joined: TextJSON[] = [];
  for (const run of runs) {
    if (run.text === "") continue;
    const text = canonicalText(run);
    const last = joined.at(-1);
    if (
      last !== undefined &&
      JSON.stringify(last.marks) === JSON.stringify(text.marks)
    )
      joined[joined.length - 1] = { ...last, text: last.text + text.text };
    else joined.push(text);
  }
  return joined;
}

/**
 * One block in canonical form: every known attribute in declared order with
 * its default filled, then every unknown attribute by name, each holding null
 * left out; runs without text dropped and neighbours with equal marks joined.
 */
export function canonicalBlock(block: BlockJSON): BlockJSON {
  const given = block.attrs ?? {};
  const filled: Record<string, unknown> = fillBlockAttrs(given);
  const attrs: Record<string, unknown> = Object.fromEntries(
    [...Object.entries(filled), ...unknownEntries(given, filled)].filter(
      ([, value]) => value !== null,
    ),
  );
  const content = canonicalRuns(block.content ?? []);
  return content.length === 0
    ? { type: "block", attrs }
    : { type: "block", attrs, content };
}

function canonicalSection(section: SectionJSON): SectionJSON {
  const content = (section.content ?? []).map(canonicalBlock);
  return content.length === 0
    ? { type: "section" }
    : { type: "section", content };
}

/**
 * The canonical form: empty is absent, everything else present in a fixed
 * order, so equal documents give equal JSON.stringify output. Never validates
 * and never throws.
 */
export function canonicalDoc(json: DocJSON): DocJSON {
  const content = (json.content ?? []).map(canonicalSection);
  return content.length === 0 ? { type: "doc" } : { type: "doc", content };
}
