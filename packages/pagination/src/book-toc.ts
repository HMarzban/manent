// Pure auto-generated Table of Contents and lowercase Roman numeral helpers for Books.
import { pageOf } from "./engines/v1/query.ts";
import type { Pagination } from "./pages.ts";

export interface BookTocEntry {
  readonly blockIndex: number;
  readonly blockId: string;
  readonly level: 1 | 2;
  readonly title: string;
  readonly pageLabel: string | null;
  readonly pageIndex: number | null;
}

export interface BookTocOptions {
  /** Include `subheading` blocks as level-2 TOC entries; defaults to false. */
  readonly includeSubheadings?: boolean;
}

const ROMAN_PAIRS: readonly (readonly [number, string])[] = Object.freeze([
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
]);

/** Lowercase Roman numeral for positive integers `n >= 1` ("i", "ii", "iv", "xii"). */
export function romanNumeral(n: number): string {
  if (!Number.isInteger(n) || n <= 0) return String(n);
  let remaining = n;
  let out = "";
  for (const [value, sym] of ROMAN_PAIRS) {
    while (remaining >= value) {
      out += sym;
      remaining -= value;
    }
  }
  return out;
}

/** Builds TOC entries with exact paginated page labels (skipping blank verso pages automatically). */
export function buildBookToc(
  pagination: Pagination,
  options?: BookTocOptions,
): readonly BookTocEntry[] {
  const includeSub = options?.includeSubheadings === true;
  const entries: BookTocEntry[] = [];
  let chapterOrdinal = 0;
  for (let i = 0; i < pagination.blocks.length; i++) {
    const block = pagination.blocks[i]!;
    if (pagination.metrics[i]?.spec.printed === false) continue;
    if (block.type === "chapter") {
      chapterOrdinal += 1;
      const title = block.text.trim() || `Chapter ${chapterOrdinal}`;
      const pageIndex = pageOf(pagination, i, 0);
      const pageLabel =
        pageIndex !== null
          ? (pagination.pages[pageIndex]?.label ?? null)
          : null;
      entries.push({
        blockIndex: i,
        blockId: block.id,
        level: 1,
        title,
        pageLabel,
        pageIndex,
      });
    } else if (includeSub && block.type === "subheading") {
      const title = block.text.trim();
      if (title === "") continue;
      const pageIndex = pageOf(pagination, i, 0);
      const pageLabel =
        pageIndex !== null
          ? (pagination.pages[pageIndex]?.label ?? null)
          : null;
      entries.push({
        blockIndex: i,
        blockId: block.id,
        level: 2,
        title,
        pageLabel,
        pageIndex,
      });
    }
  }
  return entries;
}

/** Builds TOC entries from raw blocks when unpaginated (e.g. reflowable EPUB 3). */
export function buildBookTocFromBlocks(
  blocks: readonly {
    readonly id: string;
    readonly type: string;
    readonly text: string;
  }[],
  options?: BookTocOptions,
): readonly BookTocEntry[] {
  const includeSub = options?.includeSubheadings === true;
  const entries: BookTocEntry[] = [];
  let chapterOrdinal = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.type === "chapter") {
      chapterOrdinal += 1;
      entries.push({
        blockIndex: i,
        blockId: block.id,
        level: 1,
        title: block.text.trim() || `Chapter ${chapterOrdinal}`,
        pageLabel: null,
        pageIndex: null,
      });
    } else if (includeSub && block.type === "subheading") {
      const title = block.text.trim();
      if (title !== "") {
        entries.push({
          blockIndex: i,
          blockId: block.id,
          level: 2,
          title,
          pageLabel: null,
          pageIndex: null,
        });
      }
    }
  }
  return entries;
}
