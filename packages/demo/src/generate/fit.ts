// Fitting generated text so each fixed passage starts the page it must, and a locked run fills exactly its pages.
import type { FormatId } from "@manent/schema";
import type { ProductionState } from "@manent/sync-protocol";
import type { SeedBlock } from "../content/markup.ts";
import type { Rng } from "../seed/rng.ts";
import { freeAction, withTag } from "./grammar.ts";
import type { UsedLines } from "./grammar.ts";
import { SeedBuildError } from "./guide.ts";
import type { LineIntent, StyleGuide } from "./guide.ts";

/** The most changes one fit makes before it gives up: per range, per run, per draft. */
export const FIT_ATTEMPTS = 64;

export interface SeedLayout {
  format: FormatId;
  /** The script settings that shape the page ("script.paper", "script.sceneContinued" …). */
  settings: Readonly<Record<string, unknown>>;
  /** The lock table of a locked script; null when unlocked. */
  anchors: ProductionState["anchors"] | null;
}

/** The server measures; the demo decides. */
export interface PageMeter {
  /** Each page's label and the index of its first block; a block split across pages counts on the page it starts. */
  pages(
    blocks: readonly SeedBlock[],
    layout: SeedLayout,
  ): Promise<readonly { label: string; blockIndex: number }[]>;
}

/** Indices into the whole document; `generated` is [first, end), the end exclusive. */
export interface FitRange {
  generated: readonly [number, number];
  mustStart: { page: string; blockIndex: number } | null;
}

/** The blocks from one locked start to the next, both inclusive, and the pages they must fill ("21", "21A", "21B"). */
export interface APageRun {
  firstBlock: number;
  lastBlock: number;
  labels: readonly string[];
}

/** A unit as the generator writes one, [from, to): an action, a speech, a question and its answer, an order and what follows it. */
export interface Unit {
  from: number;
  to: number;
}

/** What a dialogue line is for, by its text, with or without a joined tag; a line no entry matches states. */
export function intentsOf(guide: StyleGuide): (text: string) => LineIntent {
  const intents = new Map<string, LineIntent>();
  for (const entry of guide.dialogue) {
    intents.set(entry.text, entry.intent);
    for (const tag of guide.tags)
      intents.set(withTag(entry.text, tag), entry.intent);
  }
  return (text) => intents.get(text) ?? "state";
}

// a cue and the dialogue under it, ending at the first block that is neither or that may not move
function speechEnd(
  blocks: readonly SeedBlock[],
  at: number,
  to: number,
  movable: (i: number) => boolean,
): number {
  let end = at + 1;
  while (
    end < to &&
    movable(end) &&
    (blocks[end]!.element === "dialogue" ||
      blocks[end]!.element === "parenthetical")
  )
    end += 1;
  return end;
}

/**
 * The generated units in [from, to) whose blocks are all `movable`, in document order. Headings and every
 * element the generator does not write stay where they are; a question keeps its answer and an order the
 * action after it, so taking a unit out never leaves a question unanswered.
 */
export function unitsIn(
  blocks: readonly SeedBlock[],
  from: number,
  to: number,
  options: {
    intentOf: (text: string) => LineIntent;
    movable: (i: number) => boolean;
  },
): Unit[] {
  const { intentOf, movable } = options;
  const units: Unit[] = [];
  let at = from;
  while (at < to) {
    const element = blocks[at]!.element;
    if (!movable(at) || (element !== "character" && element !== "action")) {
      at += 1;
      continue;
    }
    let end =
      element === "action" ? at + 1 : speechEnd(blocks, at, to, movable);
    const intent = intentOf(blocks[end - 1]!.text);
    const next = end < to && movable(end) ? blocks[end] : undefined;
    if (intent === "ask" && next?.element === "character") {
      const answer = speechEnd(blocks, end, to, movable);
      if (intentOf(blocks[answer - 1]!.text) === "answer") end = answer;
    } else if (intent === "instruct" && next?.element === "action") end += 1;
    units.push({ from: at, to: end });
    at = end;
  }
  return units;
}

/**
 * A free action fragment, marked used, for a block added at `at`: it names only the cast cued in the scene of
 * the block before it. SeedBuildError "generator_exhausted" when none is free.
 */
export function actionAt(
  doc: readonly SeedBlock[],
  at: number,
  options: {
    guide: StyleGuide;
    rng: Rng;
    used: Pick<UsedLines, "has" | "add">;
  },
): SeedBlock {
  const { guide, rng, used } = options;
  const heading = doc.findLastIndex(
    (b, i) => i < at && b.element === "scene_heading",
  );
  const next = doc.findIndex(
    (b, i) => i > heading && b.element === "scene_heading",
  );
  const cues = doc
    .slice(Math.max(heading, 0), next === -1 ? doc.length : next)
    .flatMap((b) => (b.element === "character" ? [b.text] : []));
  const text = freeAction(guide, cues, rng, used);
  if (text === null)
    throw new SeedBuildError("generator_exhausted", guide.project);
  used.add(text);
  return { element: "action", text, marks: [], kind: null };
}

interface Fitting {
  doc: SeedBlock[];
  intentOf: (text: string) => LineIntent;
  guide: StyleGuide;
  rng: Rng;
  used: Pick<UsedLines, "has" | "add">;
}

/** What a span needs to fit: an action more, its last unit less, nothing, or what no length can give. */
type Verdict = "fits" | "grow" | "shrink" | "never";

// grows [from, end) by one free action at its end, or takes out its last movable unit, until `judge` says it
// fits; returns the new end
async function fitSpan(
  fitting: Fitting,
  span: { from: number; end: number; where: string },
  movable: (i: number) => boolean,
  judge: (end: number) => Promise<Verdict>,
): Promise<number> {
  const unfit = new SeedBuildError("unfit", span.where);
  let end = span.end;
  for (let attempt = 0; ; attempt += 1) {
    const verdict = await judge(end);
    if (verdict === "fits") return end;
    if (verdict === "never" || attempt === FIT_ATTEMPTS) throw unfit;
    if (verdict === "grow") {
      fitting.doc.splice(end, 0, actionAt(fitting.doc, end, fitting));
      end += 1;
      continue;
    }
    const unit = unitsIn(fitting.doc, span.from, end, {
      intentOf: fitting.intentOf,
      movable,
    }).at(-1);
    if (unit === undefined) throw unfit;
    fitting.doc.splice(unit.from, unit.to - unit.from);
    end -= unit.to - unit.from;
  }
}

const always = (): boolean => true;

// block `at` must start the page labelled `label`; a page that is missing lies further on
function placement(
  pages: readonly { label: string; blockIndex: number }[],
  label: string,
  at: number,
): Verdict {
  const page = pages.find((p) => p.label === label);
  if (page === undefined || page.blockIndex > at) return "grow";
  return page.blockIndex === at ? "fits" : "shrink";
}

/**
 * Fits each range in turn, in `totals[0].layout`, so its `mustStart` block starts the page of that label: one
 * free action is added at the range's end while the block starts too early, the range's last unit is taken out
 * while it starts too late. Then the document is made exactly `pages` long in every layout of `totals`, one unit
 * at a time, at the end of the last range when nothing must start after it and at the document's end otherwise.
 * Blocks outside the ranges are never touched. Throws a RangeError when `totals` is empty, and SeedBuildError
 * "unfit" when a range or the totals do not hold within FIT_ATTEMPTS changes, or cannot hold at all.
 */
export async function fitToPages(
  blocks: readonly SeedBlock[],
  ranges: readonly FitRange[],
  options: {
    meter: PageMeter;
    guide: StyleGuide;
    rng: Rng;
    used: Pick<UsedLines, "has" | "add">;
    totals: readonly { layout: SeedLayout; pages: number }[];
  },
): Promise<SeedBlock[]> {
  const { meter, guide, rng, used, totals } = options;
  const layout = totals[0]?.layout;
  if (layout === undefined)
    throw new RangeError("fitting to pages needs at least one layout");
  const fitting: Fitting = {
    doc: [...blocks],
    intentOf: intentsOf(guide),
    guide,
    rng,
    used,
  };
  let shift = 0;
  for (const { generated, mustStart } of ranges) {
    if (mustStart === null) continue;
    const end = generated[1] + shift;
    const at = mustStart.blockIndex + shift;
    const span = {
      from: generated[0] + shift,
      end,
      where: `${guide.project}: page ${mustStart.page}`,
    };
    const fitted = await fitSpan(fitting, span, always, async (now) =>
      placement(
        await meter.pages(fitting.doc, layout),
        mustStart.page,
        at + now - end,
      ),
    );
    shift += fitted - end;
  }
  const last = ranges.at(-1);
  const open = last !== undefined && last.mustStart === null;
  const tail = {
    from: open ? last.generated[0] + shift : fitting.doc.length,
    end: open ? last.generated[1] + shift : fitting.doc.length,
    where: `${guide.project}: ${totals.map((t) => t.pages).join(" and ")} pages`,
  };
  await fitSpan(fitting, tail, always, async () => {
    const counts = await Promise.all(
      totals.map(
        async (t) => (await meter.pages(fitting.doc, t.layout)).length,
      ),
    );
    const short = counts.some((count, i) => count < totals[i]!.pages);
    const long = counts.some((count, i) => count > totals[i]!.pages);
    // one layout wants more text and another less: no length holds both
    if (short && long) return "never";
    if (short) return "grow";
    return long ? "shrink" : "fits";
  });
  return fitting.doc;
}

/**
 * Pads a locked run so it fills exactly its pages: while it fills fewer, one free action is appended at the
 * run's end; while it fills more, the last unit of the run's last scene that holds no `fixed` block is taken out.
 * Throws SeedBuildError "unfit" when the fixed blocks alone fill more pages than `labels`, when the pages the
 * engine labels differ from `labels`, or when FIT_ATTEMPTS changes are spent.
 */
export async function fitAPages(
  blocks: readonly SeedBlock[],
  run: APageRun,
  options: {
    meter: PageMeter;
    layout: SeedLayout;
    guide: StyleGuide;
    rng: Rng;
    used: Pick<UsedLines, "has" | "add">;
    fixed: ReadonlySet<number>;
  },
): Promise<SeedBlock[]> {
  const { meter, layout, guide, rng, used, fixed } = options;
  const fitting: Fitting = {
    doc: [...blocks],
    intentOf: intentsOf(guide),
    guide,
    rng,
    used,
  };
  // fixed blocks are known by identity, which survives every splice
  const kept = new Set([...fixed].flatMap((i) => blocks[i] ?? []));
  const scene = blocks.findLastIndex(
    (b, i) =>
      i >= run.firstBlock &&
      i <= run.lastBlock &&
      b.element === "scene_heading",
  );
  const span = {
    from: Math.max(scene, run.firstBlock),
    end: run.lastBlock + 1,
    where: `${guide.project}: pages ${run.labels.join(", ")}`,
  };
  await fitSpan(
    fitting,
    span,
    (i) => !kept.has(fitting.doc[i]!),
    async (end) => {
      const labels = (await meter.pages(fitting.doc, layout))
        .filter((p) => p.blockIndex >= run.firstBlock && p.blockIndex < end)
        .map((p) => p.label);
      if (labels.length < run.labels.length) return "grow";
      if (labels.length > run.labels.length) return "shrink";
      return labels.every((label, i) => label === run.labels[i])
        ? "fits"
        : "never";
    },
  );
  return fitting.doc;
}
