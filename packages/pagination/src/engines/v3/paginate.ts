// Layout Engine v3 pagination, incremental repagination and proportional positioned-line layout.
import type { LayoutBlock } from "../../layout-block.ts";
import { NO_LOCKS } from "../../lock-table.ts";
import type { LockTable } from "../../lock-table.ts";
import { cellPtOf, isVersoPage } from "../../page-profile.ts";
import type { ElementSpec, PageProfile } from "../../page-profile.ts";
import type { BlockMetrics, ChangeHint, Pagination } from "../../pages.ts";
import type {
  LaidOutPage,
  LineRun,
  PositionedLine,
} from "../../positioned-lines.ts";
import { STYLE } from "../../units.ts";
import { upperCase } from "../v1/cells.ts";
import { fillPage, firstStart, measureAt } from "../v1/fill.ts";
import type { FilledPage, PageStart } from "../v1/fill.ts";
import { graphicBoxLines } from "../v1/graphics.ts";
import { createFlow, keyAt } from "../v1/keep.ts";
import type { Flow } from "../v1/keep.ts";
import { layoutPage as layoutPageV1 } from "../v1/layout.ts";
import { forcedOffsets, lockedLines, planLocks } from "../v1/locks.ts";
import { resolveSpec } from "../v1/measure.ts";
import { pageLabels } from "../v1/page-labels.ts";
import { paginate as paginateV1 } from "../v1/paginate.ts";
import { repaginate as repaginateV1 } from "../v1/incremental.ts";
import { walkOf, walkPage } from "../v1/walk.ts";
import { measureSerifPt } from "./serif-font.ts";
import { wrapSerif } from "./wrap.ts";

const TRAILING_BLANKS: ReadonlySet<string> = new Set([" ", "\t", "\n"]);

function defaultStyleFor(type: string): number {
  if (type === "subheading") return STYLE.BOLD;
  if (type === "epigraph") return STYLE.ITALIC;
  return 0;
}

/** Measures one block using proportional Source Serif 4 metrics for v3 book profiles. */
export function measureBlockV3(
  block: LayoutBlock,
  profile: PageProfile,
  forced: readonly number[] = [],
): BlockMetrics {
  const typo = profile.typography;
  if (typo === undefined) return measureAt([block], profile, 0, forced);
  const spec = resolveSpec(profile, block);
  if (!spec.printed)
    return Object.freeze({ lines: 0, starts: new Int32Array(0), spec });
  const cellPt = cellPtOf(profile);
  const widthPt = spec.width * cellPt;
  if (block.type === "graphic") {
    const boxLines = graphicBoxLines(block);
    const captionStarts =
      block.text === ""
        ? new Int32Array(0)
        : wrapSerif(block.text, {
            widthPt,
            firstLineIndentPt: spec.firstLineIndent * cellPt,
            fontSizePt: typo.fontSizePt,
            styles: block.styles,
            capitalized: spec.capitalized,
            forced,
          });
    const totalLines = boxLines + captionStarts.length;
    const starts = new Int32Array(totalLines);
    for (let i = 0; i < captionStarts.length; i += 1)
      starts[boxLines + i] = captionStarts[i]!;
    return Object.freeze({ lines: totalLines, starts, spec });
  }
  const firstLine =
    block.type === "body" && spec.align === "left"
      ? (block.firstLine ?? null)
      : null;

  let firstLineIndentPt =
    spec.align === "left" ? spec.firstLineIndent * cellPt : 0;
  let hangingIndentPt = 0;
  let hangingLines = 0;
  let minLines = 1;

  if (firstLine === "flush") {
    firstLineIndentPt = 0;
  } else if (firstLine === "raised_cap") {
    firstLineIndentPt = typo.fontSizePt * 0.8;
  } else if (firstLine === "drop_cap" && block.text.length > 0) {
    firstLineIndentPt = 0;
    hangingIndentPt = typo.fontSizePt * 2.2;
    hangingLines = spec.lineSpacing === 1 ? 2 : 1;
    minLines = hangingLines;
  }

  const starts = wrapSerif(block.text, {
    widthPt,
    firstLineIndentPt,
    hangingIndentPt,
    hangingLines,
    fontSizePt: typo.fontSizePt,
    styles: block.styles,
    defaultStyle: defaultStyleFor(block.type),
    capitalized: spec.capitalized,
    forced,
  });

  const lines = Math.max(minLines, starts.length);
  return Object.freeze({ lines, starts, spec });
}

function blankVersoPage(at: PageStart): FilledPage {
  return {
    block: at.block,
    line: 0,
    offset: 0,
    right: null,
    more: false,
    contd: null,
    contdRight: null,
    sceneContinued: false,
    locked: false,
    forced: true,
    topUnits: 0,
    usedUnits: 0,
    readAhead: at.block,
    blank: true,
  };
}

function fillPagesV3(flow: Flow): FilledPage[] {
  const rectoChapters = flow.profile.rectoChapters === true;
  const filled: FilledPage[] = [];
  for (let at = firstStart(flow); ;) {
    if (
      rectoChapters &&
      filled.length > 0 &&
      isVersoPage(filled.length) &&
      at.line === 0 &&
      flow.blocks[at.block]?.type === "chapter"
    ) {
      filled.push(blankVersoPage(at));
    }
    const { page, next } = fillPage(flow, at);
    filled.push(page);
    if (next === null) break;
    at = next;
  }
  return filled;
}

/** Full pagination using proportional Source Serif 4 metrics on Engine 3 manuscripts. */
export function paginateV3(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  locks: LockTable = NO_LOCKS,
): Pagination {
  if (profile.typography === undefined)
    return paginateV1(blocks, profile, locks);
  const own = Object.freeze([...blocks]);
  const plan = planLocks(own, profile, locks);
  const forced = forcedOffsets(plan.starts);
  const metrics = Object.freeze(
    own.map((block, i) => measureBlockV3(block, profile, forced.get(i) ?? [])),
  );
  const flow = createFlow(
    own,
    profile,
    metrics,
    lockedLines(plan.starts, metrics),
  );
  const filled = fillPagesV3(flow);
  const labels = pageLabels(flow, filled, plan.taken);
  return Object.freeze({
    engineVersion: profile.engineVersion,
    profile,
    locks,
    blocks: own,
    metrics,
    pages: Object.freeze(
      filled.map((page, index) =>
        Object.freeze({ ...page, index, label: labels[index]! }),
      ),
    ),
  });
}

/** Incremental repagination reusing unchanged block metrics on Engine 3 manuscripts. */
export function repaginateV3(
  previous: Pagination,
  blocks: readonly LayoutBlock[],
  change?: ChangeHint,
): Pagination {
  if (previous.profile.typography === undefined)
    return repaginateV1(previous, blocks, change);
  const profile = previous.profile;
  const locks = previous.locks;
  const own = Object.freeze([...blocks]);
  const plan = planLocks(own, profile, locks);
  const forced = forcedOffsets(plan.starts);
  const prevByBlock = new Map<LayoutBlock, BlockMetrics>();
  for (let i = 0; i < previous.blocks.length; i++)
    prevByBlock.set(previous.blocks[i]!, previous.metrics[i]!);

  const metrics = Object.freeze(
    own.map((block, i) => {
      const f = forced.get(i);
      if (f === undefined || f.length === 0) {
        const cached = prevByBlock.get(block);
        if (cached !== undefined) return cached;
      }
      return measureBlockV3(block, profile, f ?? []);
    }),
  );
  const flow = createFlow(
    own,
    profile,
    metrics,
    lockedLines(plan.starts, metrics),
  );
  const filled = fillPagesV3(flow);
  const labels = pageLabels(flow, filled, plan.taken);
  return Object.freeze({
    engineVersion: profile.engineVersion,
    profile,
    locks,
    blocks: own,
    metrics,
    pages: Object.freeze(
      filled.map((page, index) =>
        Object.freeze({ ...page, index, label: labels[index]! }),
      ),
    ),
  });
}

function runsOfV3(
  p: Pagination,
  i: number,
  m: number,
  fontSizePt: number,
): { runs: LineRun[]; widthPt: number } {
  const block = p.blocks[i]!;
  const { starts, spec } = p.metrics[i]!;
  const runs: LineRun[] = [];
  let widthPt = 0;
  const baseStyle = defaultStyleFor(block.type);
  const add = (text: string, style: number) => {
    if (text === "") return;
    const effective = style | baseStyle;
    const caps = spec.capitalized || (effective & STYLE.CAPS) !== 0;
    const shown = caps ? upperCase(text) : text;
    widthPt += measureSerifPt(shown, effective, fontSizePt);
    const last = runs.at(-1);
    if (last?.style === effective)
      runs[runs.length - 1] = { text: last.text + shown, style: effective };
    else runs.push({ text: shown, style: effective });
  };
  if (block.text === "" && keyAt(p.blocks, i) === "break") {
    add(p.profile.furniture.breakMark, 0);
    return { runs, widthPt };
  }
  const drawn = block.text;
  const styleAt = (at: number) =>
    at < drawn.length ? (block.styles?.[at] ?? 0) : 0;
  let end = starts[m + 1] ?? drawn.length;
  while (end > starts[m]! && TRAILING_BLANKS.has(drawn[end - 1]!)) end--;
  for (let at = starts[m]!, to = at; at < end; at = to) {
    while (to < end && styleAt(to) === styleAt(at)) to++;
    add(drawn.slice(at, to), styleAt(at));
  }
  return { runs, widthPt };
}

function xPtOf(
  spec: ElementSpec,
  widthPt: number,
  cellPt: number,
  firstLine: boolean,
  blockFirstLine: string | null,
): number {
  const indentPt = spec.indent * cellPt;
  const boxWidthPt = spec.width * cellPt;
  switch (spec.align) {
    case "left": {
      const firstPt =
        firstLine &&
        blockFirstLine !== "flush" &&
        blockFirstLine !== "drop_cap" &&
        blockFirstLine !== "raised_cap"
          ? spec.firstLineIndent * cellPt
          : 0;
      return indentPt + firstPt;
    }
    case "center":
      return indentPt + (boxWidthPt - widthPt) / 2;
    case "right":
      return indentPt + boxWidthPt - widthPt;
  }
}

/** Lays out one Engine 3 page with exact proportional point horizontal coordinates (`xPt`). */
export function layoutPageV3(p: Pagination, index: number): LaidOutPage {
  const typo = p.profile.typography;
  if (typo === undefined) return layoutPageV1(p, index);
  const page = p.pages[index];
  if (page === undefined)
    throw new RangeError(`page ${index} is outside 0..${p.pages.length - 1}`);
  if (page.blank === true)
    return { index, label: page.label, lines: [], graphics: [] };
  const cellPt = typo.cellPt;
  const lines: PositionedLine[] = [];
  const base = layoutPageV1(p, index);
  const walk = walkOf(
    p,
    index,
    (i, m, y) => {
      const block = p.blocks[i]!;
      const { spec } = p.metrics[i]!;
      if (block.type === "graphic") return;
      const { runs, widthPt } = runsOfV3(p, i, m, typo.fontSizePt);
      const xPt = xPtOf(
        spec,
        widthPt,
        cellPt,
        m === 0,
        block.firstLine ?? null,
      );
      lines.push({
        kind: "text",
        x: xPt / cellPt,
        xPt,
        y,
        cells: widthPt / cellPt,
        runs,
        blockId: block.id,
        blockLine: m,
      });
    },
    () => {},
  );
  walkPage(walk);
  return {
    index,
    label: page.label,
    lines,
    graphics: base.graphics,
  };
}
