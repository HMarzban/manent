// Each section's exact height, from the engine, as the intrinsic size the browser keeps for a section it skips.
import { UNIT_PX } from "@manent/pagination";
import type { NodeViewConstructor } from "prosemirror-view";
import {
  CONTAINMENT,
  PAGE_GAP_PX,
  SPELLCHECK_MAX_BLOCKS,
} from "../page/config.ts";
import type { BrowserEngine } from "../page/config.ts";
import { screenPagePx } from "../page/profile-css.ts";
import { paginationKey } from "./plugin.ts";
import type { PaginationState } from "./plugin.ts";

/**
 * The section's height in px at 100 %: its blocks' lines and space as placed, and the page breaks that fall in
 * it; the first section also holds the first page's top margin, the last the last page's blank and bottom margin.
 */
export function sectionHeightPx(
  state: PaginationState,
  section: number,
): number {
  const { pagination: p, index, settings } = state;
  const { engine } = settings;
  const { top, bottom } = screenPagePx(p.profile);
  const from = index.sectionStart[section]!;
  const to = index.sectionStart[section + 1]!;
  let height =
    engine.flowUnits(p, from, to) * UNIT_PX +
    engine.breaksIn(p, from, to) * (bottom + PAGE_GAP_PX + top);
  if (section === 0) height += top;
  if (section === index.sectionPos.length - 1)
    height += engine.fillUnits(p, p.pages.length - 1) * UNIT_PX + bottom;
  return height;
}

/** Pages × page height + (pages − 1) × PAGE_GAP_PX, in px at 100 %. */
export function contentHeightPx(state: PaginationState): number {
  const pages = state.pagination.pages.length;
  return (
    pages * screenPagePx(state.pagination.profile).height +
    (pages - 1) * PAGE_GAP_PX
  );
}

/**
 * `div.section` as plain DOM, its own content. Where the engine has containment it carries
 * `contain-intrinsic-size: <height>px` from sectionHeightPx, set when it is made and on every update,
 * which ProseMirror makes only when the section's node or decorations change. It has no `auto`, with which WebKit
 * draws a section it skips at the size it last drew, not at the height its pages now give it.
 */
export function sectionNodeView(engine: BrowserEngine): NodeViewConstructor {
  return (node, view, getPos) => {
    const dom = document.createElement("div");
    dom.className = "section";
    const size = () => {
      const state = paginationKey.getState(view.state);
      const pos = getPos();
      if (!CONTAINMENT[engine] || state === undefined || pos === undefined)
        return;
      const section = view.state.doc.resolve(pos).index(0);
      dom.style.containIntrinsicSize = `${sectionHeightPx(state, section)}px`;
    };
    size();
    return {
      dom,
      contentDOM: dom,
      update: (next) => {
        if (next.type !== node.type) return false;
        size();
        return true;
      },
    };
  };
}

/** Spellcheck is off above SPELLCHECK_MAX_BLOCKS blocks: a browser checks every block of the script. */
export function spellcheckFor(blockCount: number): "true" | "false" {
  return blockCount > SPELLCHECK_MAX_BLOCKS ? "false" : "true";
}
