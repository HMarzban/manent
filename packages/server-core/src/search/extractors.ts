// Viewer-safe text extractors per document kind for full-text search.
import { scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocKind } from "@manent/sync-protocol";
import { viewSnapshot } from "../view/view.ts";

export interface SearchExtractor {
  readonly kind: DocKind;
  /** Text visible to anyone with read access (viewer-safe body text). */
  text(doc: CrdtDoc): string;
  /** Optional text visible ONLY to editors and owners (e.g. cuts); never searched for viewers or commenters. */
  editorText?(doc: CrdtDoc): string;
}

/**
 * Extracts plain text strictly from the canonical body blocks that a viewer receives (`viewSnapshot`).
 * Never reads writers-only `notes`, `alternates`, `cuts`, `settings`, or any other map.
 */
export function extractBodyText(doc: CrdtDoc): string {
  const { blocks } = viewSnapshot(scriptBody(doc).materialize());
  const lines: string[] = [];
  for (const block of blocks) {
    const text = (block.content ?? []).map((run) => run.text).join("");
    if (text.length > 0) lines.push(text);
  }
  return lines.join("\n");
}

export const SEARCH_EXTRACTORS: readonly SearchExtractor[] = [
  { kind: "script", text: extractBodyText },
  { kind: "outline", text: extractBodyText },
  { kind: "ink", text: extractBodyText },
];
