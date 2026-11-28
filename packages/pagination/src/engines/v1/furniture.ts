// The derived furniture a reader asks about: the same-speaker suffix, the cast list and the page number.
import type { Page, Pagination } from "../../pages.ts";
import { castListOf } from "./cast.ts";
import { hasSpeakerSuffix } from "./fill.ts";

/** This cue is shown with the suffix because the same person spoke last. */
export function contdSuffix(p: Pagination, block: number): boolean {
  return hasSpeakerSuffix(p.blocks, p.profile, block);
}

/** The cast list drawn under scene heading `block`, in parentheses; null for none. */
export function castList(p: Pagination, block: number): string | null {
  return castListOf(p.blocks, p.profile, block);
}

/** The page's number as printed, its label and a period ("13."); null on the first page or blank verso pages. */
export function pageNumberText(page: Page): string | null {
  return page.index === 0 || page.blank === true ? null : `${page.label}.`;
}
