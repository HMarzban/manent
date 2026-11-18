// Scene numbers: stored, or counted among the script's scene headings and slugs.
import type { Pagination } from "../../pages.ts";
import { isSceneHeading } from "./fill.ts";
import { specKey } from "./profile.ts";

const LETTER_COUNT = 26;
const LETTER_A = 0x41;

/** A count from 1 in letters: 1 is "A", 26 "Z", 27 "AA", 28 "AB". Throws RangeError below 1. */
export function letters(n: number): string {
  if (!Number.isInteger(n) || n < 1)
    throw new RangeError(`a letter count must be a positive integer, not ${n}`);
  let out = "";
  for (let rest = n; rest > 0; rest = Math.floor((rest - 1) / LETTER_COUNT))
    out = String.fromCharCode(LETTER_A + ((rest - 1) % LETTER_COUNT)) + out;
  return out;
}

/** The number a scene heading or slug shows: its stored `num`, else its count; null for any other block. */
export function sceneNumber(p: Pagination, block: number): string | null {
  const heading = p.blocks[block];
  if (
    heading === undefined ||
    !isSceneHeading(specKey(heading.type, heading.kind))
  )
    return null;
  if (heading.num !== null) return heading.num;
  let count = 0;
  for (let i = 0; i <= block; i++)
    if (isSceneHeading(specKey(p.blocks[i]!.type, p.blocks[i]!.kind))) count++;
  return p.profile.furniture.scenesLettered ? letters(count) : String(count);
}
