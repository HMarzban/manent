// What each block shows of the pages, as the attributes of its node decoration.
import type {
  ElementSpec,
  Engine,
  LayoutBlock,
  Pagination,
} from "@manent/pagination";
import type { Dual } from "@manent/schema";
import { SLACK_LEFT } from "../page/profile-css.ts";

// A block's dual column, in a run only: a right column counts after a left one.
export function columnOf(
  blocks: readonly LayoutBlock[],
  i: number,
): Dual | null {
  const side = blocks[i]!.dual;
  if (side !== "right") return side;
  let at = i;
  while (blocks[at]?.dual === "right") at--;
  return blocks[at]?.dual === "left" ? "right" : null;
}

// The first block of each column on each page, so its space above is the drop a page's first block takes.
export function firstsOnPages(p: Pagination): Set<number> {
  const firsts = new Set<number>();
  for (const page of p.pages) {
    if (page.line === 0) firsts.add(page.block);
    if (page.right !== null && page.right.line === 0)
      firsts.add(page.right.block);
    if (page.line > 0 || page.right !== null) continue;
    let split = page.block;
    while (p.blocks[split]?.dual === "left") split++;
    if (split > page.block && p.blocks[split]?.dual === "right")
      firsts.add(split);
  }
  return firsts;
}

function overrideStyle(spec: ElementSpec): string {
  return `--el-indent: ${spec.indent}; --el-width: ${spec.width}; --el-before: ${spec.spaceBefore}; --el-slack-left: ${SLACK_LEFT[spec.align]}; text-align: ${spec.align}`;
}

export interface BlockContext {
  readonly p: Pagination;
  readonly engine: Engine;
  readonly firsts: ReadonlySet<number>;
  /** The profile's own element specs: a block laid out by another has overrides. */
  readonly rows: ReadonlySet<ElementSpec>;
}

export function blockAttrs(
  context: BlockContext,
  i: number,
): Record<string, string> | null {
  const { p, engine } = context;
  const { furniture } = p.profile;
  const block = p.blocks[i]!;
  const { spec } = p.metrics[i]!;
  const column = columnOf(p.blocks, i);
  const classes = [
    ...(context.firsts.has(i) ? ["pg-first"] : []),
    ...(column === null ? [] : [column === "left" ? "dual-l" : "dual-r"]),
  ];
  const attrs: Record<string, string> = {};
  if (classes.length > 0) attrs["class"] = classes.join(" ");
  const scene = furniture.scenesNumbered ? engine.sceneNumber(p, i) : null;
  if (scene !== null) attrs["data-scene"] = scene;
  if (engine.contdSuffix(p, i)) attrs["data-contd"] = furniture.contdText;
  const speech = engine.speechNumber(p, i);
  if (speech !== null) attrs["data-speech"] = String(speech);
  if (spec.enclosure !== null) {
    attrs["data-open"] = spec.enclosure[0];
    attrs["data-close"] = spec.enclosure[1];
  }
  if (block.type === "break" && block.text === "")
    attrs["data-mark"] = furniture.breakMark;
  if (!context.rows.has(spec)) attrs["style"] = overrideStyle(spec);
  return Object.keys(attrs).length > 0 ? attrs : null;
}
