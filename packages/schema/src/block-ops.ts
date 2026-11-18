import type { BlockJSON } from "./json.ts";

/** One block-level change, by block ID. `after` null means the very start of the document. */
export type BlockOp =
  | { op: "insert"; after: string | null; block: BlockJSON }
  | { op: "replace"; block: BlockJSON }
  | { op: "delete"; id: string };
