// Elastic pages: a page that an imported file started is drawn whole while it holds a few lines more
// than fit, so its page numbers stay those of the file until it is edited here.
import { UNITS_PER_LINE } from "@manent/pagination";
import type { Engine, Page, Pagination } from "@manent/pagination";

/** Lines over that an imported page holds in its bottom margin before it continues on an A-page. */
export const ELASTIC_LINES = 4;

const isOverflow = (page: Page | undefined): page is Page =>
  page !== undefined && !page.locked && !page.forced;

// The pages made before, by the base pages they came from: a base page the engine kept as the same object
// gives back the same elastic page, so a caller that compares pages by identity sees only what changed.
const mergedFrom = new WeakMap<Page, { overflow: Page; page: Page }>();
const movedFrom = new WeakMap<Page, Page>();

// The parent drawn down to where its overflow ended.
const merged = (parent: Page, overflow: Page, index: number): Page => {
  const kept = mergedFrom.get(parent);
  if (kept?.overflow === overflow && kept.page.index === index)
    return kept.page;
  const page = Object.freeze({
    ...parent,
    index,
    more: overflow.more,
    usedUnits: parent.usedUnits + overflow.usedUnits - overflow.topUnits,
    readAhead: Math.max(parent.readAhead, overflow.readAhead),
  });
  mergedFrom.set(parent, { overflow, page });
  return page;
};

const moved = (page: Page, index: number): Page => {
  if (page.index === index) return page;
  const kept = movedFrom.get(page);
  if (kept?.index === index) return kept;
  const copy = Object.freeze({ ...page, index });
  movedFrom.set(page, copy);
  return copy;
};

/**
 * The pages with each elastic imported page drawn whole: an import-anchored page followed by exactly one
 * overflow page (not locked, not forced) whose content takes at most ELASTIC_LINES × UNITS_PER_LINE units
 * (`usedUnits − topUnits`) loses that page — its lines continue below the body, into the bottom margin — and
 * every later page's `index` moves down by one. `overflowing` lists the labels of import-anchored pages whose
 * overflow is longer, which keep their A-pages. A pagination with no import anchor is returned as it is. Idempotent:
 * elasticPages(elasticPages(p).pagination) gives the same pages and the same `overflowing` (a merged page is never
 * merged again), so lockedPagination over the elastic engine's own result changes nothing.
 */
export function elasticPages(p: Pagination): {
  pagination: Pagination;
  overflowing: string[];
} {
  const sources = new Map(
    p.locks.anchors.map((anchor) => [anchor.label, anchor.source]),
  );
  const pages: Page[] = [];
  const overflowing: string[] = [];
  for (let k = 0; k < p.pages.length; k++) {
    const page = p.pages[k]!;
    const overflow = p.pages[k + 1];
    if (
      !page.locked ||
      sources.get(page.label) !== "import" ||
      !isOverflow(overflow)
    ) {
      pages.push(moved(page, pages.length));
      continue;
    }
    if (
      isOverflow(p.pages[k + 2]) ||
      overflow.usedUnits - overflow.topUnits > ELASTIC_LINES * UNITS_PER_LINE
    ) {
      overflowing.push(page.label);
      pages.push(moved(page, pages.length));
      continue;
    }
    pages.push(merged(page, overflow, pages.length));
    k++;
  }
  if (pages.length === p.pages.length) return { pagination: p, overflowing };
  return {
    pagination: Object.freeze({
      ...p,
      pages: Object.freeze(pages),
    }),
    overflowing,
  };
}

// Each engine elasticEngine made, to the engine it wraps.
const bases = new WeakMap<Engine, Engine>();

/**
 * An Engine whose paginate and repaginate return elasticPages(…).pagination; repaginate is handed the engine's
 * own earlier result, kept in a WeakMap by the reshaped one. elasticEngine(elasticEngine(e)) is elasticEngine(e);
 * baseEngine(elasticEngine(e)) is e, and baseEngine(e) is e.
 */
export function elasticEngine(engine: Engine): Engine {
  if (bases.has(engine)) return engine;
  const madeFrom = new WeakMap<Pagination, Pagination>();
  const reshaped = (base: Pagination): Pagination => {
    const { pagination } = elasticPages(base);
    madeFrom.set(pagination, base);
    return pagination;
  };
  const elastic: Engine = Object.freeze({
    ...engine,
    paginate: (...args: Parameters<Engine["paginate"]>) =>
      reshaped(engine.paginate(...args)),
    repaginate: (
      ...[prev, blocks, change]: Parameters<Engine["repaginate"]>
    ) => {
      const base = madeFrom.get(prev) ?? prev;
      const next = engine.repaginate(base, blocks, change);
      return next === base ? prev : reshaped(next);
    },
  });
  bases.set(elastic, engine);
  return elastic;
}

export function baseEngine(engine: Engine): Engine {
  return bases.get(engine) ?? engine;
}
