import type { BlockJSON } from "@manent/schema";
import type { RevisionColour } from "./colours.ts";

/** A block marked revised as a whole, or by the UTF-16 ranges inserted and the offsets where text was deleted. */
export type BlockMark =
  | { readonly kind: "whole" }
  | {
      readonly kind: "ranges";
      readonly inserted: readonly (readonly [number, number])[];
      readonly deletedAt: readonly number[];
    };

/** The version marks are measured against: its blocks by id, the ids of the blocks it shows, and each id's place in its order. */
export interface Baseline {
  readonly blocks: ReadonlyMap<string, BlockJSON>;
  readonly visible: ReadonlySet<string>;
  readonly order: ReadonlyMap<string, number>;
}

/** A person's choice for one block: `marked` marks it whole; `cleared` unmarks it while its content still hashes to `hash`. */
export type Override =
  | { readonly kind: "marked" }
  | { readonly kind: "cleared"; readonly hash: string };

/** One revision as a page draws it; `day` is YYYY-MM-DD and `marks` is by block id. */
export interface RevisionSource {
  readonly ordinal: number;
  readonly name: string;
  readonly colour: RevisionColour;
  readonly mark: string;
  readonly day: string;
  readonly fullDraft: boolean;
  readonly marks: ReadonlyMap<string, BlockMark>;
}
