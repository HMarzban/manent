// A new script's first block, the one the Library writes into a script it makes and the page shows until a document has one.
import { firstElement, randomBlockId } from "@manent/schema";
import type { BlockJSON, FormatId } from "@manent/schema";

/** One empty block of `format`'s first element, under a new id. */
export function firstBlock(format: FormatId): BlockJSON {
  const { type, kind } = firstElement(format);
  return { type: "block", attrs: { id: randomBlockId(), type, kind } };
}
