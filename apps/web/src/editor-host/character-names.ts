// Reads the open script's character cue names and counts from the live editor's pagination.
import { collectNames } from "@manent/editor";
import { livePagination } from "./live-editor.ts";

/** Character names in the open script, in order of first use; empty when none or no pages. */
export function characterNamesOf(docId: string): readonly string[] {
  const pagination = livePagination(docId);
  if (pagination === null) return [];
  return [...collectNames(pagination.blocks).characters.keys()];
}

/** Total character cues matching `name` (ignoring case) in the open script. */
export function countCharacterCues(docId: string, name: string): number {
  const pagination = livePagination(docId);
  const target = name.trim().toLowerCase();
  if (pagination === null || target === "") return 0;
  let total = 0;
  for (const [key, count] of collectNames(pagination.blocks).characters) {
    if (key.toLowerCase() === target) total += count;
  }
  return total;
}
