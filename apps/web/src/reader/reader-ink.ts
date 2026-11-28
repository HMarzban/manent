// Pure Ink draft detection and .ink source extraction for the external reader frame (`/r/$token`).
import type { BlockJSON } from "@manent/schema";
import type { DraftOpenResponse, VersionContent } from "@manent/sync-protocol";
import { docOfContent } from "../history/content-doc.ts";

function textOfBlock(block: BlockJSON): string {
  if (block.content === undefined) return "";
  return block.content.map((node) => node.text ?? "").join("");
}

/** True when `content` declares Ink format or holds at least one `ink_line` block. */
export function isInkDraftContent(content: VersionContent): boolean {
  if (content.settings["script.format"] === "ink") return true;
  const doc = docOfContent(content);
  if (doc === null) return false;
  for (const section of doc.content ?? []) {
    for (const block of section.content ?? []) {
      if (block.attrs?.type === "ink_line") return true;
    }
  }
  return false;
}

/** True when a sent draft opened on `/r/$token` is an Ink story. */
export function isInkDraft(
  draft: Pick<DraftOpenResponse, "content" | "docKind">,
): boolean {
  return draft.docKind === "ink" || isInkDraftContent(draft.content);
}

/** Extracts `.ink` source lines from `ink_line` blocks, matching `inkSourceOf` byte-for-byte. */
export function inkSourceFromContent(content: VersionContent): string {
  const doc = docOfContent(content);
  if (doc === null) return "";
  const lines: string[] = [];
  for (const section of doc.content ?? []) {
    for (const block of section.content ?? []) {
      if (block.attrs?.type === "ink_line") lines.push(textOfBlock(block));
    }
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}
