// Block operations applied to a document's JSON, as a merge states its result.
import type { BlockJSON, BlockOp, DocJSON } from "@manent/schema";

/** Each section's blocks, and the section of each block by ID. */
interface Placed {
  sections: BlockJSON[][];
  sectionOf: Map<string, number>;
}

function place(placed: Placed, block: BlockJSON, section: number): void {
  const id = block.attrs?.id;
  if (typeof id === "string" && !placed.sectionOf.has(id))
    placed.sectionOf.set(id, section);
}

function find(
  placed: Placed,
  id: unknown,
): { blocks: BlockJSON[]; index: number } | null {
  const section = typeof id === "string" ? placed.sectionOf.get(id) : undefined;
  if (section === undefined) return null;
  const blocks = placed.sections[section]!;
  return { blocks, index: blocks.findIndex((block) => block.attrs?.id === id) };
}

function insert(placed: Placed, after: string | null, block: BlockJSON): void {
  if (after === null) {
    // A document always holds a section; one that does not gains one rather than lose the block.
    if (placed.sections.length === 0) placed.sections.push([]);
    placed.sections[0]!.unshift(block);
    place(placed, block, 0);
    return;
  }
  const anchor = find(placed, after);
  if (anchor === null) return;
  anchor.blocks.splice(anchor.index + 1, 0, block);
  place(placed, block, placed.sectionOf.get(after)!);
}

function apply(placed: Placed, op: BlockOp): void {
  if (op.op === "insert") return insert(placed, op.after, op.block);
  const id = op.op === "delete" ? op.id : op.block.attrs?.id;
  const found = find(placed, id);
  if (found === null) return;
  if (op.op === "replace") {
    found.blocks[found.index] = op.block;
    return;
  }
  found.blocks.splice(found.index, 1);
  placed.sectionOf.delete(op.id);
}

/**
 * The document with each operation applied in order. An insert opens no
 * section: it joins its anchor's, or the first for the start. An operation
 * whose block or anchor the document does not hold is passed over.
 */
export function applyBlockOpsToJSON(
  doc: DocJSON,
  ops: readonly BlockOp[],
): DocJSON {
  const placed: Placed = {
    sections: (doc.content ?? []).map((section) => [
      ...(section.content ?? []),
    ]),
    sectionOf: new Map(),
  };
  placed.sections.forEach((blocks, section) => {
    for (const block of blocks) place(placed, block, section);
  });
  for (const op of ops) apply(placed, op);
  return {
    ...doc,
    content: placed.sections.map((blocks, i) => ({
      ...(doc.content?.[i] ?? { type: "section" }),
      content: blocks,
    })),
  };
}
