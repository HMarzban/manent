// Whether a stored document holds what only a newer build understands.
import { scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { validateDoc } from "@manent/schema";

/**
 * True when a validateDoc issue of severity "newer" is anywhere: an element,
 * attribute or mark this build does not know. It reads the whole document, so
 * it runs once, when a document is bound.
 */
export function hasNewerContent(doc: CrdtDoc): boolean {
  return validateDoc(scriptBody(doc).materializeRaw()).some(
    (issue) => issue.severity === "newer",
  );
}
