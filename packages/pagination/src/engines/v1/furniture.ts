// The derived furniture a reader asks about: the same-speaker suffix and the page number.
import type { Page, Pagination } from "../../pages.ts";
import { hasSpeakerSuffix } from "./fill.ts";

/** This cue is shown with the suffix because the same person spoke last. */
export function contdSuffix(p: Pagination, block: number): boolean {
  return hasSpeakerSuffix(p.blocks, p.profile, block);
}

/** The page's number as printed, its label and a period ("13."); null on the first page. */
export function pageNumberText(page: Page): string | null {
  return page.index === 0 ? null : `${page.label}.`;
}
