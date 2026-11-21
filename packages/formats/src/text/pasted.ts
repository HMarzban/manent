// Text pasted into a script: Final Draft's text read by its indents, Fountain by its reader, anything else left plain.
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, BlockType, IdSource } from "@manent/schema";
import { isFountainHeading } from "../fountain/lines.ts";
import { readFountain } from "../fountain/read.ts";
import { FormatError } from "../script/model.ts";
import type { ImportedScript } from "../script/model.ts";

/** Distinct elements a paste must make, or one other than the format's plain element, before it is converted. */
export const PASTE_MIN_ELEMENTS = 2;

export interface PastedText {
  readonly kind: "fountain" | "final_draft_text";
  readonly blocks: readonly BlockJSON[];
}

const LINE_BREAK = /\r\n|\r|\n/;
const LOWER = /\p{Ll}/u;
/** A tab counts as four spaces of indent. */
const TAB = "    ";

interface Line {
  /** Leading spaces, a tab counted as four. */
  readonly indent: number;
  /** The line without its indent and trailing space; empty for a blank line. */
  readonly text: string;
}

const isBetween = (indent: number, from: number, to: number): boolean =>
  indent >= from && indent <= to;

function lineOf(raw: string): Line {
  const line = raw.replaceAll("\t", TAB).trimEnd();
  const text = line.trimStart();
  return { indent: line.length - text.length, text };
}

/** A cue (indented 20 to 30, no lower-case letter) with a line of dialogue (indented 8 to 13) right after it. */
function isFinalDraftText(lines: readonly Line[]): boolean {
  return lines.some(
    (line, i) =>
      line.text !== "" &&
      isBetween(line.indent, 20, 30) &&
      !LOWER.test(line.text) &&
      lines[i + 1]?.text !== "" &&
      isBetween(lines[i + 1]?.indent ?? -1, 8, 13),
  );
}

/** A line of Final Draft's text is the element its indent says. */
function elementOf({ indent, text }: Line): BlockType {
  if (indent >= 31) return "transition";
  if (indent >= 20) return "character";
  if (indent >= 14) return text.startsWith("(") ? "parenthetical" : "dialogue";
  if (indent >= 8) return "dialogue";
  return isFountainHeading(text) ? "scene_heading" : "action";
}

/** Final Draft's text: consecutive lines of one element joined by one space; a blank line ends an element. */
function readFinalDraftText(
  lines: readonly Line[],
  ids: IdSource,
): BlockJSON[] {
  const elements: { type: BlockType; text: string }[] = [];
  let open = false;
  for (const line of lines) {
    if (line.text === "") {
      open = false;
      continue;
    }
    const type = elementOf(line);
    const last = elements.at(-1);
    if (open && last?.type === type) last.text += ` ${line.text}`;
    else elements.push({ type, text: line.text });
    open = true;
  }
  return elements.map(({ type, text }) =>
    canonicalBlock({
      type: "block",
      attrs: { id: ids(), type },
      content: [{ type: "text", text }],
    }),
  );
}

/** Whether a Fountain reading holds what plain text would not: a heading, a cue with its speech, a note, a synopsis, a section or a page break. */
function isFountain(script: ImportedScript): boolean {
  const types = script.blocks.map((block) => block.attrs?.type);
  return (
    script.notes.length > 0 ||
    script.kept.some((item) => item.name === "synopsis") ||
    types.some(
      (type, i) =>
        type === "scene_heading" ||
        type === "group" ||
        type === "page_break" ||
        (type === "character" &&
          (types[i + 1] === "dialogue" || types[i + 1] === "parenthetical")),
    )
  );
}

/** The Fountain reading of a paste, without a title page and without its notes; null when it is plain or too long a line to read. */
function readFountainPaste(text: string, ids: IdSource): BlockJSON[] | null {
  try {
    const script = readFountain(text, { ids, titlePage: false });
    return isFountain(script) ? [...script.blocks] : null;
  } catch (error) {
    // a line past the Fountain limit is pasted as it is, which is what a plain paste does
    if (error instanceof FormatError) return null;
    throw error;
  }
}

/** Null for text that is plain: it is pasted as it is today. */
export function readPastedText(
  text: string,
  options: { ids: IdSource; elements: readonly string[]; plainElement: string },
): PastedText | null {
  const lines = text.split(LINE_BREAK).map(lineOf);
  const finalDraft = isFinalDraftText(lines);
  const read = finalDraft
    ? readFinalDraftText(lines, options.ids)
    : readFountainPaste(text, options.ids);
  if (read === null) return null;
  const blocks = read.map((block) =>
    options.elements.includes(String(block.attrs?.type))
      ? block
      : { ...block, attrs: { ...block.attrs, type: options.plainElement } },
  );
  const elements = new Set(blocks.map((block) => block.attrs?.type));
  const converted =
    elements.size >= PASTE_MIN_ELEMENTS ||
    (elements.size === 1 && !elements.has(options.plainElement));
  if (!converted) return null;
  return { kind: finalDraft ? "final_draft_text" : "fountain", blocks };
}
