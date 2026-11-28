// The one mapping from schema's block view to the engine's input.
import type { BlockView, FlatBlock } from "@manent/schema";
import type { LayoutBlock } from "../../layout-block.ts";
import { STYLE } from "../../units.ts";

const MARK_STYLES: ReadonlyMap<string, number> = new Map([
  ["bold", STYLE.BOLD],
  ["italic", STYLE.ITALIC],
  ["underline", STYLE.UNDERLINE],
  ["strike", STYLE.STRIKE],
  ["caps", STYLE.CAPS],
]);
/** The elements a dual column holds. */
const DUAL_ELEMENTS: ReadonlySet<string> = new Set([
  "character",
  "parenthetical",
  "dialogue",
]);

function stylesOf(view: BlockView, length: number): Uint8Array | null {
  const styles = new Uint8Array(length);
  let at = 0;
  let styled = false;
  for (const run of view.runs) {
    let style = 0;
    for (const mark of run.marks) style |= MARK_STYLES.get(mark) ?? 0;
    if (style !== 0) {
      styles.fill(style, at, at + run.text.length);
      styled = true;
    }
    at += run.text.length;
  }
  return styled ? styles : null;
}

export function toLayoutBlock(view: BlockView): LayoutBlock {
  const { attrs } = view;
  const text = view.runs.map((run) => run.text).join("");
  return Object.freeze({
    id: attrs.id ?? "",
    type: attrs.type,
    kind: attrs.kind,
    text,
    styles: stylesOf(view, text.length),
    dual: DUAL_ELEMENTS.has(attrs.type) ? attrs.dual : null,
    num: attrs.num,
    align: attrs.align,
    indent: attrs.indent,
    width: attrs.width,
    spaceBefore: attrs.spaceBefore,
    noContd: attrs.noContd,
    ...(attrs.noTiming === true ? { noTiming: true } : {}),
    ...(attrs.graphic !== null ? { graphic: attrs.graphic } : {}),
    ...(attrs.firstLine !== null ? { firstLine: attrs.firstLine } : {}),
  });
}

export function toLayoutBlocks(flat: readonly FlatBlock[]): LayoutBlock[] {
  return flat.map(toLayoutBlock);
}
