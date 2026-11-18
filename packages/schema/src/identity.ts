// Block identity: IDs, the split marker, and the attributes each edit gives a block.
import { DEFAULT_BLOCK_ATTRS } from "./attrs.ts";
import type { BlockAttrs } from "./attrs.ts";
import type { DocJSON } from "./json.ts";

export type IdSource = () => string;

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** 16 URL-safe characters from 96 random bits. */
export const randomBlockId: IdSource = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let id = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const bits = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    id +=
      ALPHABET[(bits >> 18) & 63]! +
      ALPHABET[(bits >> 12) & 63]! +
      ALPHABET[(bits >> 6) & 63]! +
      ALPHABET[bits & 63]!;
  }
  return id;
};

const BLOCK_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** 8 to 64 characters of [A-Za-z0-9_-]. */
export function isBlockId(value: unknown): value is string {
  return typeof value === "string" && BLOCK_ID.test(value);
}

/** The `from` marker of a block split or moved from `originId`. */
export function formatFrom(originId: string, nonce: string): string {
  return `${originId}:${nonce}`;
}

/** The origin and nonce of a `from` marker, or null when it is not one. */
export function parseFrom(
  value: string | null,
): { originId: string; nonce: string } | null {
  if (value === null) return null;
  const colon = value.indexOf(":");
  if (colon <= 0 || colon === value.length - 1) return null;
  return { originId: value.slice(0, colon), nonce: value.slice(colon + 1) };
}

/** Enter at either end of a block: a new block with default attributes. */
export function attrsForNewBlock(type: string, id: string): BlockAttrs {
  return { ...DEFAULT_BLOCK_ATTRS, id, type };
}

/**
 * The second half of a split block: it keeps the origin's layout overrides and
 * timing exclusion, and nothing that identifies the scene.
 */
export function attrsForSplitTail(
  origin: BlockAttrs,
  type: string,
  id: string,
  nonce: string,
): BlockAttrs {
  return {
    ...DEFAULT_BLOCK_ATTRS,
    id,
    type,
    align: origin.align,
    indent: origin.indent,
    width: origin.width,
    spaceBefore: origin.spaceBefore,
    noTiming: origin.noTiming,
    from: origin.id === null ? null : formatFrom(origin.id, nonce),
  };
}

/**
 * Joining two blocks: the earlier block's attributes win, and the later
 * block's number is reserved so that it is never issued again.
 */
export function attrsAfterJoin(
  earlier: BlockAttrs,
  later: BlockAttrs,
): { attrs: BlockAttrs; reservedNum: string | null } {
  return { attrs: { ...earlier }, reservedNum: later.num };
}

/**
 * Blocks still waiting for an ID (null or absent), and every ID held by more
 * than one block, each named once in order of first appearance. validateDoc
 * reports the same facts as issues; nothing may call this on a keystroke.
 */
export function findIdProblems(doc: DocJSON): {
  missing: number;
  duplicates: string[];
} {
  let missing = 0;
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const section of doc.content ?? [])
    for (const block of section.content ?? []) {
      const id = block.attrs?.id;
      if (id === null || id === undefined) missing++;
      else if (seen.has(id)) duplicates.add(id);
      else seen.add(id);
    }
  return { missing, duplicates: [...duplicates] };
}
