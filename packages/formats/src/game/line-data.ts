// Game Script line-data exports (JSON and XML): stable block IDs, speaker names, and branching kinds/depths.
import { classifyLine } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";

function textOfBlock(block: BlockJSON): string {
  return (block.content ?? []).map((run) => run.text).join("");
}

type BranchKind = "choice" | "gather" | "condition" | "tag";

interface LineDataRow {
  readonly id: string;
  readonly type: string;
  readonly character?: string;
  readonly kind?: BranchKind;
  readonly depth?: number;
  readonly text: string;
}

// Strips leading choice (*, +) or gather (-) markers and spaces between/after them, stopping before diverts (->).
function stripLeadingMarkers(text: string, marks: string): string {
  let at = 0;
  while (at < text.length && (text[at] === " " || text[at] === "\t")) at++;
  while (at < text.length) {
    const ch = text[at]!;
    if (marks.includes(ch) && text.slice(at, at + 2) !== "->") at++;
    else if (ch === " " || ch === "\t") at++;
    else break;
  }
  return text.slice(at);
}

function speakerFromCue(cueText: string): string | null {
  const paren = cueText.indexOf("(");
  const name = (paren === -1 ? cueText : cueText.slice(0, paren)).trim();
  return name === "" ? null : name;
}

function extractLineData(blocks: readonly BlockJSON[]): LineDataRow[] {
  const rows: LineDataRow[] = [];
  let currentCharacter: string | null = null;
  let choiceDepth = 0;

  for (const block of blocks) {
    const type =
      typeof block.attrs?.type === "string" ? block.attrs.type : "general";
    const id = typeof block.attrs?.id === "string" ? block.attrs.id : "";
    const rawText = textOfBlock(block);

    if (type === "character") {
      currentCharacter = speakerFromCue(rawText);
    } else if (type !== "dialogue" && type !== "parenthetical") {
      currentCharacter = null;
    }

    if (type === "scene_heading") choiceDepth = 0;
    if (rawText === "") continue;

    const character =
      (type === "dialogue" || type === "parenthetical") &&
      currentCharacter !== null
        ? currentCharacter
        : undefined;

    let kind: BranchKind | undefined;
    let depth: number | undefined;
    let text = rawText;

    if (type === "general") {
      const classified = classifyLine(rawText, "branching", false);
      if (classified.kind === "choice") {
        kind = "choice";
        depth = classified.depth;
        choiceDepth = classified.depth;
        text = stripLeadingMarkers(rawText, "*+");
      } else if (classified.kind === "gather") {
        kind = "gather";
        depth = classified.depth;
        choiceDepth = Math.max(0, classified.depth - 1);
        text = stripLeadingMarkers(rawText, "-");
      } else if (rawText.trimStart().startsWith("{")) {
        kind = "condition";
        depth = choiceDepth;
      } else if (rawText.trimStart().startsWith("#")) {
        kind = "tag";
        depth = choiceDepth;
      }
    }

    rows.push({
      id,
      type,
      ...(character === undefined ? {} : { character }),
      ...(kind === undefined ? {} : { kind }),
      ...(depth === undefined ? {} : { depth }),
      text,
    });
  }

  return rows;
}

function escapeXmlAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatLineElement(row: LineDataRow): string {
  const attrs: string[] = [
    `id="${escapeXmlAttr(row.id)}"`,
    `type="${escapeXmlAttr(row.type)}"`,
  ];
  if (row.character !== undefined)
    attrs.push(`character="${escapeXmlAttr(row.character)}"`);
  if (row.kind !== undefined) attrs.push(`kind="${escapeXmlAttr(row.kind)}"`);
  if (row.depth !== undefined) attrs.push(`depth="${row.depth}"`);
  attrs.push(`text="${escapeXmlAttr(row.text)}"`);
  return `  <line ${attrs.join(" ")}/>`;
}

/** Serialises Game Script blocks as indented line-data JSON with omitted absent fields and fixed key order. */
export function writeLineDataJson(blocks: readonly BlockJSON[]): string {
  return `${JSON.stringify(extractLineData(blocks), null, 2)}\n`;
}

/** Serialises Game Script blocks as UTF-8 line-data XML with omitted absent attributes and fixed attribute order. */
export function writeLineDataXml(blocks: readonly BlockJSON[]): string {
  const lines = extractLineData(blocks).map(formatLineElement);
  const body = lines.length === 0 ? "" : `${lines.join("\n")}\n`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<lines>\n${body}</lines>\n`;
}
