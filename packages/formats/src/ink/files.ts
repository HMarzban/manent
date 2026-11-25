// Reading, writing and joining Ink source files as ink_line blocks.
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, IdSource } from "@manent/schema";
import { FormatError } from "../script/model.ts";

const UTF8_BOM = "\uFEFF";

function stripBom(text: string): string {
  return text.startsWith(UTF8_BOM) ? text.slice(1) : text;
}

function textOfBlock(block: BlockJSON): string {
  return (block.content ?? []).map((run) => run.text).join("");
}

/** Decodes raw .ink bytes as strict UTF-8, dropping any leading BOM; throws FormatError("malformed") on invalid UTF-8. */
export function readInkBytes(bytes: Uint8Array, ids: IdSource): BlockJSON[] {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new FormatError("malformed", "invalid UTF-8 in ink source", {
      cause,
    });
  }
  return readInk(text, ids);
}

/**
 * Splits Ink source text into `ink_line` blocks, dropping a leading BOM and trailing `\r`.
 * A final `\n` terminates the last line rather than adding an extra empty block, so `\n`-ended files round-trip byte for byte.
 */
export function readInk(text: string, ids: IdSource): BlockJSON[] {
  const clean = stripBom(text);
  if (clean === "") return [];
  const rawLines = clean.split("\n");
  if (clean.endsWith("\n")) rawLines.pop();
  return rawLines.map((raw) => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    return canonicalBlock({
      type: "block",
      attrs: { id: ids(), type: "ink_line" },
      ...(line === "" ? {} : { content: [{ type: "text", text: line }] }),
    });
  });
}

/** Extracts Ink source from `ink_line` blocks, joined with `\n` and ending with one `\n` (empty string when no blocks). */
export function inkSourceOf(blocks: readonly BlockJSON[]): string {
  const lines = blocks
    .filter((block) => block.attrs?.type === "ink_line")
    .map(textOfBlock);
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

/** Writes `ink_line` blocks as an `.ink` source file; line N (1-based) equals the Nth `ink_line` block. */
export function writeInk(blocks: readonly BlockJSON[]): string {
  return inkSourceOf(blocks);
}

/**
 * Joins a project's Ink documents in Library order, preceding each with a `// <title>` comment and a blank line.
 * Duplicate knot names are left untouched so compilation reports them at their joined 1-based line numbers.
 */
export function joinInkProject(
  parts: readonly { readonly title: string; readonly source: string }[],
): string {
  if (parts.length === 0) return "";
  return (
    parts
      .map(({ title, source }) => {
        const body = source.endsWith("\n") ? source.slice(0, -1) : source;
        return body === "" ? `// ${title}\n` : `// ${title}\n\n${body}`;
      })
      .join("\n\n") + "\n"
  );
}
