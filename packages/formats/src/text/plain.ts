// Reading a plain-text script: Final Draft's indented text or Fountain when recognised, else paragraphs as Action.
import { FORMAT_ELEMENTS, canonicalBlock } from "@manent/schema";
import type { BlockJSON, IdSource } from "@manent/schema";
import { LINE_BREAK } from "../fountain/lines.ts";
import { IMPORT_LIMIT_BYTES } from "../script/decode.ts";
import { FormatError } from "../script/model.ts";
import type { ImportedScript } from "../script/model.ts";
import { readPastedText } from "./pasted.ts";

/** Consecutive non-blank lines joined by one space; a blank line starts the next Action paragraph. */
function paragraphBlocks(text: string, ids: IdSource): BlockJSON[] {
  const blocks: BlockJSON[] = [];
  let lines: string[] = [];
  const flush = (): void => {
    if (lines.length === 0) return;
    blocks.push(
      canonicalBlock({
        type: "block",
        attrs: { id: ids(), type: "action" },
        content: [{ type: "text", text: lines.join(" ") }],
      }),
    );
    lines = [];
  };
  for (const raw of text.split(LINE_BREAK)) {
    const trimmed = raw.trim();
    if (trimmed === "") flush();
    else lines.push(trimmed);
  }
  flush();
  return blocks;
}

/**
 * A plain-text script: read as Final Draft text or Fountain when `readPastedText` recognises it, otherwise each
 * paragraph between blank lines becomes one Action block. Throws FormatError "too_large" past IMPORT_LIMIT_BYTES
 * UTF-16 code units.
 */
export function readPlainText(
  text: string,
  options: { ids: IdSource },
): ImportedScript {
  if (text.length > IMPORT_LIMIT_BYTES)
    throw new FormatError(
      "too_large",
      `plain text may hold ${IMPORT_LIMIT_BYTES} characters, not ${text.length}`,
    );
  const pasted = readPastedText(text, {
    ids: options.ids,
    elements: FORMAT_ELEMENTS.screenplay,
    plainElement: "action",
  });
  const blocks =
    pasted === null ? paragraphBlocks(text, options.ids) : [...pasted.blocks];
  return {
    from: "text",
    title: null,
    paper: null,
    blocks,
    notes: [],
    production: null,
    kept: [],
    coloursMapped: 0,
    unread: [],
  };
}
