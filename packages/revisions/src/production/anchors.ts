// The page starts recorded when page numbers are locked and when a revision is issued.
import { engineFor } from "@manent/pagination";
import type {
  LockAnchorRecord,
  LockSource,
  Page,
  Pagination,
} from "@manent/pagination";
import { FALLBACK_IDS, QUOTE_UNITS } from "./model.ts";

const isHighSurrogate = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;

function quoteAt(text: string, offset: number): string {
  let end = Math.min(text.length, offset + QUOTE_UNITS);
  if (end < text.length && isHighSurrogate(text.charCodeAt(end - 1))) end--;
  return text.slice(offset, end);
}

// The ids of the blocks after the page's first that have a line on it.
function fallbacksOf(p: Pagination, page: Page): string[] {
  const next = p.pages[page.index + 1];
  const end =
    next === undefined ? p.blocks.length : next.block + (next.line > 0 ? 1 : 0);
  return p.blocks
    .slice(page.block + 1, Math.min(end, page.block + 1 + FALLBACK_IDS))
    .map((block) => block.id);
}

function derivedPages(p: Pagination): Page[] {
  const first = p.pages.findIndex((page) => page.locked);
  return first < 0
    ? []
    : p.pages.filter((page) => !page.locked && page.index > first);
}

/**
 * One record per page (`every_page`), or per page that is not locked and follows a locked page
 * (`derived_pages`, the A-pages), numbered 1…n in page order. Each holds the page's label and where it
 * starts, a quote of the text there ("" at a block's end) and up to FALLBACK_IDS following block ids
 * on the page.
 */
export function captureAnchors(
  p: Pagination,
  which: "every_page" | "derived_pages",
  level: number,
  source: LockSource,
): LockAnchorRecord[] {
  const pages = which === "every_page" ? p.pages : derivedPages(p);
  return pages.map((page, i) => {
    const { id, text } = p.blocks[page.block]!;
    return {
      level,
      order: i + 1,
      label: page.label,
      blockId: id,
      offset: page.offset,
      quote: quoteAt(text, page.offset),
      fallbackIds: fallbacksOf(p, page),
      source,
    };
  });
}

/**
 * Both lists in page order, `order` renumbered 1…n. An added record replaces a current one of the
 * same label: an issue anchor set aside whose label a page has since taken. Throws RangeError for a
 * pagination of an engine this build does not carry.
 */
export function mergeAnchors(
  current: readonly LockAnchorRecord[],
  added: readonly LockAnchorRecord[],
  p: Pagination,
): LockAnchorRecord[] {
  const engine = engineFor(p.engineVersion);
  if (engine === null)
    throw new RangeError(
      `a pagination's engine version must be one this build carries, not ${p.engineVersion}`,
    );
  const replaced = new Set(added.map((record) => record.label));
  return [...current.filter((record) => !replaced.has(record.label)), ...added]
    .toSorted((a, b) => engine.comparePageLabels(a.label, b.label))
    .map((record, i) => ({
      ...record,
      order: i + 1,
      fallbackIds: [...record.fallbackIds],
    }));
}
