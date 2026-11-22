// Earlier drafts as deterministic changes to the generated parts of the final one, and the sessions between two.
import type { SeedBlock } from "../content/markup.ts";
import type { Rng } from "../seed/rng.ts";
import { FIT_ATTEMPTS, actionAt, intentsOf, unitsIn } from "./fit.ts";
import type { PageMeter, SeedLayout, Unit } from "./fit.ts";
import { SeedBuildError } from "./guide.ts";
import type { LineIntent, StyleGuide } from "./guide.ts";

/** `name` null: a session, not a named draft. */
export interface DraftTarget {
  name: string | null;
  pages: number;
}

/** `at` is a position in the document as the changes before it in the same list have left it. */
export type BlockChange =
  | { op: "insert"; at: number; block: SeedBlock }
  | { op: "replace"; at: number; block: SeedBlock }
  | { op: "delete"; at: number };

interface Deriving {
  guide: StyleGuide;
  rng: Rng;
  meter: PageMeter;
  layout: SeedLayout;
  intentOf: (text: string) => LineIntent;
  used: Set<string>;
  /** The fixed blocks, known by identity, which survives every splice; no draft changes them. */
  kept: ReadonlySet<SeedBlock>;
}

// units chosen at random, without repeats, until they hold at least `size` blocks; last in the document first
function pickUnits(units: Unit[], size: number, rng: Rng): Unit[] {
  const pool = [...units];
  const chosen: Unit[] = [];
  let blocks = 0;
  while (blocks < size && pool.length > 0) {
    const unit = pool.splice(rng.int(0, pool.length - 1), 1)[0]!;
    chosen.push(unit);
    blocks += unit.to - unit.from;
  }
  return chosen.toSorted((a, b) => b.from - a.from);
}

// takes out generated units, or adds unused actions after them, until the draft is `pages` long; each change is
// sized from the blocks a page holds, and halved after it overshoots, so the count closes in instead of swinging
async function reachPages(
  draft: SeedBlock[],
  pages: number,
  deriving: Deriving,
): Promise<void> {
  const { guide, rng, meter, layout } = deriving;
  const where = `${guide.project}: a draft of ${pages} pages`;
  let size = 0;
  let direction = 0;
  for (let attempt = 0; ; attempt += 1) {
    const measured = (await meter.pages(draft, layout)).length;
    if (measured === pages) return;
    if (attempt === FIT_ATTEMPTS) throw new SeedBuildError("unfit", where);
    const want = Math.sign(pages - measured);
    const perPage = draft.length / Math.max(measured, 1);
    const estimate = Math.max(
      1,
      Math.round((Math.abs(pages - measured) - 0.5) * perPage),
    );
    if (direction === 0) size = estimate;
    else if (want === direction) size = Math.min(size, estimate);
    else size = Math.min(estimate, Math.max(1, Math.floor(size / 2)));
    direction = want;
    const units = unitsIn(draft, 0, draft.length, {
      intentOf: deriving.intentOf,
      movable: (i) => !deriving.kept.has(draft[i]!),
    });
    if (want < 0) {
      if (units.length === 0) throw new SeedBuildError("unfit", where);
      for (const unit of pickUnits(units, size, rng))
        draft.splice(unit.from, unit.to - unit.from);
      continue;
    }
    const ends = Array.from({ length: size }, () =>
      units.length === 0 ? draft.length : rng.pick(units).to,
    ).toSorted((x, y) => y - x);
    for (const at of ends) draft.splice(at, 0, actionAt(draft, at, deriving));
  }
}

/**
 * The drafts that lead to `final`, oldest first, one per target; the last equals `final`. Going back from
 * `final`, each earlier draft takes out generated units, or adds unused actions, chosen with `rng`, until `meter`
 * gives its page count; a block in `fixed` (indices into `final`) is never changed. Throws SeedBuildError "unfit"
 * when a draft does not reach its count within FIT_ATTEMPTS measurements, and "generator_exhausted" when it runs
 * out of actions.
 */
export async function deriveDrafts(
  final: readonly SeedBlock[],
  targets: readonly DraftTarget[],
  options: {
    fixed: ReadonlySet<number>;
    guide: StyleGuide;
    rng: Rng;
    meter: PageMeter;
    layout: SeedLayout;
  },
): Promise<SeedBlock[][]> {
  if (targets.length === 0) return [];
  const { fixed, guide, rng, meter, layout } = options;
  const deriving: Deriving = {
    guide,
    rng,
    meter,
    layout,
    intentOf: intentsOf(guide),
    used: new Set(final.map((block) => block.text)),
    kept: new Set([...fixed].flatMap((i) => final[i] ?? [])),
  };
  const drafts = [[...final]];
  for (const target of targets.slice(0, -1).toReversed()) {
    const draft = [...drafts.at(-1)!];
    await reachPages(draft, target.pages, deriving);
    drafts.push(draft);
  }
  return drafts.toReversed();
}

type Step = "keep" | "delete" | "insert";

// Myers' forward pass: for each round d, the furthest x on every diagonal k = x - y in [-d - 1, d + 1] before it
function furthestReaching(
  a: readonly SeedBlock[],
  b: readonly SeedBlock[],
): Int32Array[] {
  const offset = a.length + b.length + 1;
  const v = new Int32Array(2 * offset + 1);
  const trace: Int32Array[] = [];
  for (let d = 0; ; d += 1) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)
          ? v[offset + k + 1]!
          : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < a.length && y < b.length && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= a.length && y >= b.length) return trace;
    }
  }
}

// Myers' shortest edit script from a to b, front to back
function shortestEdit(
  a: readonly SeedBlock[],
  b: readonly SeedBlock[],
): Step[] {
  const trace = furthestReaching(a, b);
  const backwards: Step[] = [];
  let x = a.length;
  let y = b.length;
  for (let d = trace.length - 1; d >= 0; d -= 1) {
    const before = trace[d]!;
    const k = x - y;
    const down = k === -d || (k !== d && before[k + d]! < before[k + d + 2]!);
    const fromK = down ? k + 1 : k - 1;
    const fromX = before[fromK + d + 1]!;
    while (x > fromX && y > fromX - fromK) {
      backwards.push("keep");
      x -= 1;
      y -= 1;
    }
    if (d > 0) backwards.push(down ? "insert" : "delete");
    x = fromX;
    y = fromX - fromK;
  }
  return backwards.toReversed();
}

// the edit script as changes in document order: within a run of edits, rewritten blocks first, then what was
// added or taken out
function changesOf(
  steps: readonly Step[],
  newer: readonly SeedBlock[],
): BlockChange[] {
  const changes: BlockChange[] = [];
  let at = 0;
  let next = 0;
  let i = 0;
  while (i < steps.length) {
    if (steps[i] === "keep") {
      at += 1;
      next += 1;
      i += 1;
      continue;
    }
    let deletes = 0;
    const inserts: SeedBlock[] = [];
    for (; i < steps.length && steps[i] !== "keep"; i += 1)
      if (steps[i] === "delete") deletes += 1;
      else inserts.push(newer[next++]!);
    for (const [n, block] of inserts.entries())
      changes.push({
        op: n < deletes ? "replace" : "insert",
        at: at + n,
        block,
      });
    for (let n = inserts.length; n < deletes; n += 1)
      changes.push({ op: "delete", at: at + inserts.length });
    at += inserts.length;
  }
  return changes;
}

/**
 * The changes that turn `older` into `newer` (the fewest blocks added and taken out, a block taken out and one
 * added in its place being one rewrite), in document order, cut into `count` runs of consecutive changes as
 * even as they divide; a run may be empty. Applying the runs in order to `older` gives `newer`. A block is
 * unchanged only when it is the same object in both, as deriveDrafts keeps every block it does not change.
 * Throws a RangeError unless `count` is a positive integer.
 */
export function sessionsBetween(
  older: readonly SeedBlock[],
  newer: readonly SeedBlock[],
  count: number,
): BlockChange[][] {
  if (!Number.isInteger(count) || count < 1)
    throw new RangeError(
      `the sessions between two drafts must be a positive integer count, not ${count}`,
    );
  const changes = changesOf(shortestEdit(older, newer), newer);
  return Array.from({ length: count }, (_, n) =>
    changes.slice(
      Math.floor((n * changes.length) / count),
      Math.floor(((n + 1) * changes.length) / count),
    ),
  );
}
