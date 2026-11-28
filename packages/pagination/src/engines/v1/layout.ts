// A page as positioned lines: its blocks' text on the profile's grid, and its furniture.
// Units are half-lines.
import type { ElementSpec } from "../../page-profile.ts";
import type { Pagination } from "../../pages.ts";
import type {
  LaidOutPage,
  LineKind,
  LinePlace,
  LineRun,
  PositionedGraphic,
  PositionedLine,
} from "../../positioned-lines.ts";
import { STYLE, UNIT_PT, UNITS_PER_LINE } from "../../units.ts";
import { clusterCells, upperCase } from "./cells.ts";
import { runAt } from "./dual.ts";
import { isSceneHeading, speechNumber } from "./cast.ts";
import { suffixOf } from "./fill.ts";
import { pageNumberText } from "./furniture.ts";
import { graphicBoxLines, positionGraphic } from "./graphics.ts";
import { keyAt } from "./keep.ts";
import { sceneNumber } from "./scene-numbers.ts";
import { walkOf, walkPage } from "./walk.ts";
import type { Walk } from "./walk.ts";

/** Cells between a scene or speech number and the column, on either side. */
const SCENE_NUMBER_GAP = 2;
const TRAILING_BLANKS: ReadonlySet<string> = new Set([" ", "\t", "\n"]);

function furnitureLine(
  kind: LineKind,
  x: number,
  y: number,
  text: string,
): PositionedLine {
  return {
    kind,
    x,
    y,
    cells: clusterCells(text, 0, text.length, false),
    runs: [{ text, style: 0 }],
    blockId: null,
    blockLine: -1,
  };
}

// Line m of block i as drawn: capitals applied, the enclosure and the suffix in style 0, trailing
// blanks left out, cut where the style byte changes.
function runsOf(
  p: Pagination,
  i: number,
  m: number,
): { runs: LineRun[]; cells: number } {
  const block = p.blocks[i]!;
  const { starts, spec } = p.metrics[i]!;
  const runs: LineRun[] = [];
  let cells = 0;
  const add = (text: string, style: number) => {
    if (text === "") return;
    const caps = spec.capitalized || (style & STYLE.CAPS) !== 0;
    cells += clusterCells(text, 0, text.length, caps);
    const shown = caps ? upperCase(text) : text;
    const last = runs.at(-1);
    if (last?.style === style)
      runs[runs.length - 1] = { text: last.text + shown, style };
    else runs.push({ text: shown, style });
  };
  if (block.text === "" && keyAt(p.blocks, i) === "break") {
    add(p.profile.furniture.breakMark, 0);
    return { runs, cells };
  }
  const [open, close] = spec.enclosure ?? ["", ""];
  const drawn = block.text + suffixOf(p.blocks, p.profile, i).text + close;
  const styleAt = (at: number) =>
    at < block.text.length ? (block.styles?.[at] ?? 0) : 0;
  let end = starts[m + 1] ?? drawn.length;
  while (end > starts[m]! && TRAILING_BLANKS.has(drawn[end - 1]!)) end--;
  if (m === 0) add(open, 0);
  for (let at = starts[m]!, to = at; at < end; at = to) {
    while (to < end && styleAt(to) === styleAt(at)) to++;
    add(drawn.slice(at, to), styleAt(at));
  }
  return { runs, cells };
}

function xOf(spec: ElementSpec, cells: number, firstLine: boolean): number {
  switch (spec.align) {
    case "left":
      return spec.indent + (firstLine ? spec.firstLineIndent : 0);
    case "center":
      return spec.indent + (spec.width - cells) / 2;
    case "right":
      return spec.indent + spec.width - cells;
  }
}

// The margin numbers level with line 0 of block i: a scene heading's on each side, a cue's speech number on its
// column's side.
function addNumbers(
  p: Pagination,
  lines: PositionedLine[],
  i: number,
  y: number,
): void {
  const speech = speechNumber(p, i);
  if (speech !== null) {
    const line = furnitureLine("speech_number", 0, y, String(speech));
    const run = runAt(p.blocks, p.profile, i);
    const right = run !== null && i >= run.split;
    lines.push({
      ...line,
      x: right
        ? p.profile.columnCells + SCENE_NUMBER_GAP
        : -SCENE_NUMBER_GAP - line.cells,
    });
  }
  if (
    !p.profile.furniture.scenesNumbered ||
    !isSceneHeading(keyAt(p.blocks, i))
  )
    return;
  const sides = p.profile.furniture.sceneNumberSides;
  if (sides === "none") return;
  const number = sceneNumber(p, i)!;
  const left = furnitureLine("scene_number", 0, y, number);
  if (sides === "left" || sides === "both")
    lines.push({ ...left, x: -SCENE_NUMBER_GAP - left.cells });
  if (sides === "right" || sides === "both")
    lines.push({ ...left, x: p.profile.columnCells + SCENE_NUMBER_GAP });
}

// A text line sits on the last unit of its slot, whose top is `top`.
const textY = (spec: ElementSpec, top: number): number =>
  top + spec.lineSpacing - 1;

// Line m of block i in the slot whose top is `top`, with the margin numbers beside a block's first line.
function addText(
  p: Pagination,
  lines: PositionedLine[],
  i: number,
  m: number,
  top: number,
  blockLine = m,
): void {
  const { spec } = p.metrics[i]!;
  const { runs, cells } = runsOf(p, i, m);
  const y = textY(spec, top);
  lines.push({
    kind: "text",
    x: xOf(spec, cells, blockLine === 0),
    y,
    cells,
    runs,
    blockId: p.blocks[i]!.id,
    blockLine,
  });
  if (m === 0) addNumbers(p, lines, i, y);
}

// Where a cue of the column block `block` is in sits: the character spec's indent, or a dual column's.
function cueX(p: Pagination, block: number): number {
  const { dual, dualRightOffset, elements } = p.profile;
  const run = runAt(p.blocks, p.profile, block);
  if (run === null) return elements.character.indent;
  return dual.character.indent + (block < run.split ? 0 : dualRightOffset);
}

function addFurniture(walk: Walk, lines: PositionedLine[]): void {
  const { p, page, next } = walk;
  const { furniture, geometry, columnCells, linesPerPage, dualRightOffset } =
    p.profile;
  const add = (kind: LineKind, x: number, y: number, text: string) =>
    lines.push(furnitureLine(kind, x, y, text));
  const rightCueX = dualRightOffset + p.profile.dual.character.indent;
  const flushRight = (text: string) =>
    columnCells - clusterCells(text, 0, text.length, false);
  const contdOf = (cue: string) =>
    cue.endsWith(furniture.contdText.trim()) ? cue : cue + furniture.contdText;
  const number = pageNumberText(page);
  if (number !== null)
    add(
      "page_number",
      flushRight(number),
      (geometry.pageNumberTopPt - geometry.marginTopPt) / UNIT_PT,
      number,
    );
  if (page.sceneContinued)
    add("scene_continued", 0, 0, furniture.continuedTopText);
  const cueRow = page.topUnits - UNITS_PER_LINE;
  if (page.contd !== null)
    add("contd", cueX(p, page.block), cueRow, contdOf(page.contd));
  if (page.contdRight !== null)
    add("contd", rightCueX, cueRow, contdOf(page.contdRight));
  if (next === null) return;
  if (page.more)
    add("more", cueX(p, next.block), walk.foot, furniture.moreText);
  if (page.more && next.right !== null)
    add("more", rightCueX, walk.foot, furniture.moreText);
  if (next.sceneContinued)
    add(
      "scene_continued_foot",
      flushRight(furniture.continuedFootText),
      linesPerPage * UNITS_PER_LINE,
      furniture.continuedFootText,
    );
}

/** A page's lines and graphics, text and furniture, sorted by `y`, then `x`. Throws RangeError for an index past the last page. */
export function layoutPage(p: Pagination, pageIndex: number): LaidOutPage {
  const lines: PositionedLine[] = [];
  const graphics: PositionedGraphic[] = [];
  const walk = walkOf(
    p,
    pageIndex,
    (i, m, top) => {
      const block = p.blocks[i]!;
      if (block.type === "graphic") {
        const boxLines = graphicBoxLines(block);
        if (m === 0)
          graphics.push(
            positionGraphic(block, p.metrics[i]!.spec, top, boxLines),
          );
        if (m >= boxLines) addText(p, lines, i, m, top, m - boxLines);
        return;
      }
      addText(p, lines, i, m, top);
    },
    () => {},
  );
  walkPage(walk);
  if (walk.page.blank !== true) addFurniture(walk, lines);
  return {
    index: walk.page.index,
    label: walk.page.label,
    lines: lines.toSorted((a, b) => a.y - b.y || a.x - b.x),
    graphics,
  };
}

/**
 * Where each text line of a page sits, as layoutPage places it, in the order the page is walked; its text is not
 * laid out, so this costs a fraction of layoutPage. Throws RangeError for an index past the last page.
 */
export function linePlacesOf(p: Pagination, pageIndex: number): LinePlace[] {
  const places: LinePlace[] = [];
  walkPage(
    walkOf(
      p,
      pageIndex,
      (i, m, top) => {
        const block = p.blocks[i]!;
        if (block.type === "graphic") {
          const boxLines = graphicBoxLines(block);
          const hasCaption = p.metrics[i]!.lines > boxLines;
          if (hasCaption ? m < boxLines : m > 0) return;
          places.push({
            blockId: block.id,
            blockLine: hasCaption ? m - boxLines : 0,
            y: textY(p.metrics[i]!.spec, top),
          });
          return;
        }
        places.push({
          blockId: block.id,
          blockLine: m,
          y: textY(p.metrics[i]!.spec, top),
        });
      },
      () => {},
    ),
  );
  return places;
}

/** Each page's label (null for the first) and the text of its first row on the page, its lines joined by one space. */
export function pageStarts(
  p: Pagination,
): { label: string | null; firstLine: string }[] {
  return p.pages.map((page, k) => {
    const shown = layoutPage(p, k).lines.filter((line) => line.y >= 0);
    const row = shown[0]?.y;
    return {
      label: k === 0 ? null : page.label,
      firstLine: shown
        .filter((line) => line.y === row)
        .map((line) => line.runs.map((run) => run.text).join(""))
        .join(" "),
    };
  });
}
