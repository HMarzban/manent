// Combines multiple ordered manuscript parts in a book project into one continuous export script.
import type { BlockJSON, MarkJSON, TextJSON } from "@manent/schema";
import type { ScriptForExport } from "../script/model.ts";

export interface BookPart {
  readonly title: string;
  readonly blocks: readonly BlockJSON[];
}

export interface CombineBookPartsOptions {
  readonly title: string;
  readonly parts: readonly BookPart[];
  /** Inserts a chapter heading for any part that does not already begin with one when compiling 2+ parts. Defaults to true. */
  readonly headingPerPart?: boolean;
}

function namespaceFootnoteMarks(
  marks: readonly MarkJSON[] | undefined,
  prefix: string,
): MarkJSON[] | undefined {
  if (marks === undefined || marks.length === 0) return undefined;
  let changed = false;
  const next = marks.map((mark) => {
    if (mark.type !== "footnote") return mark;
    const rawId = mark.attrs?.id;
    if (typeof rawId !== "string" || rawId === "") return mark;
    changed = true;
    return {
      ...mark,
      attrs: { ...mark.attrs, id: `${prefix}${rawId}` },
    };
  });
  return changed ? next : undefined;
}

function cloneBlockForPart(block: BlockJSON, prefix: string): BlockJSON {
  if (block.content === undefined || block.content.length === 0) return block;
  let changed = false;
  const content: TextJSON[] = block.content.map((node) => {
    if (node.type !== "text" || node.marks === undefined) return node;
    const marks = namespaceFootnoteMarks(node.marks, prefix);
    if (marks === undefined) return node;
    changed = true;
    return { ...node, marks };
  });
  return changed ? { ...block, content } : block;
}

function startsWithChapter(blocks: readonly BlockJSON[]): boolean {
  for (const block of blocks) {
    const type = block.attrs?.type;
    if (type === "group") continue;
    return type === "chapter";
  }
  return false;
}

/**
 * Joins ordered book parts into one continuous manuscript `ScriptForExport`, preserving each part's blocks and
 * namespacing footnote mark ids per part so footnotes number sequentially across the whole book without collisions.
 */
export function combineBookParts(
  options: CombineBookPartsOptions,
): ScriptForExport {
  const { title, parts, headingPerPart = true } = options;
  const combined: BlockJSON[] = [];
  const multi = parts.length > 1;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const prefix = `p${i + 1}-`;
    const partTitle = part.title.trim();
    if (
      multi &&
      headingPerPart &&
      partTitle !== "" &&
      !startsWithChapter(part.blocks)
    ) {
      combined.push({
        type: "block",
        attrs: { type: "chapter" },
        content: [{ type: "text", text: partTitle }],
      });
    }
    for (const block of part.blocks) {
      combined.push(cloneBlockForPart(block, prefix));
    }
  }

  return {
    title,
    format: "manuscript",
    blocks: combined,
    notes: [],
    record: null,
    production: null,
  };
}
