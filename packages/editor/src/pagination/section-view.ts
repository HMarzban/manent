// Each section's exact height, from the engine, as the intrinsic size the browser keeps for a section it skips.
import type { NodeViewConstructor } from "prosemirror-view";
import { CONTAINMENT, SPELLCHECK_MAX_BLOCKS } from "../page/config.ts";
import type { BrowserEngine } from "../page/config.ts";
import { paginationKey } from "./plugin.ts";
import { drawnHeightPx } from "./section-height.ts";

/**
 * `div.section` as plain DOM, its own content. Where the engine has containment it carries
 * `contain-intrinsic-size: <height>px` from drawnHeightPx, set when it is made and on every update,
 * which ProseMirror makes only when the section's node or decorations change: a section left behind keeps the
 * height it is drawn at, which the margin after its run makes up.
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
      dom.style.containIntrinsicSize = `${drawnHeightPx(state, section)}px`;
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
