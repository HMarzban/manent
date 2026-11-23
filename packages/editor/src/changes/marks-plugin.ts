// The asterisks beside the changed lines of the sheets in view, drawn while changes since a version are shown as
// asterisks only.
import { Plugin } from "prosemirror-state";
import type { EditorState, PluginView } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { drawnPages } from "../margin-people/margin-people-plugin.ts";
import { paginationKey } from "../pagination/plugin.ts";
import { createMarkLayer } from "./layer.ts";
import { changesKey } from "./plugin.ts";

// who changed each line is drawn with the changes on the page only, so asterisks only names no one
const NO_AUTHORS = new Map<string, never>();

const isRedrawn = (prev: EditorState, next: EditorState): boolean =>
  changesKey.getState(prev) !== changesKey.getState(next) ||
  paginationKey.getState(prev)?.pagination !==
    paginationKey.getState(next)?.pagination;

function changeMarksView(view: EditorView): PluginView {
  const frame = view.dom.parentElement;
  if (frame === null) return {};
  const layer = createMarkLayer(frame);
  const draw = () => {
    // with the changes on the page, the struck text it draws moves the lines the engine placed the asterisks by
    const shown = changesKey.getState(view.state)?.display === "asterisks";
    const pages = paginationKey.getState(view.state);
    const count = pages?.pagination.pages.length ?? 0;
    layer.update(view.state, shown ? drawnPages(frame, count) : [], NO_AUTHORS);
  };
  // the page scaffold names each sheet it draws, on scroll and zoom as well as when the pages change
  const sheets = new MutationObserver(draw);
  sheets.observe(frame, { subtree: true, attributeFilter: ["data-page"] });
  draw();
  return {
    update(_, prev) {
      if (isRedrawn(prev, view.state)) draw();
    },
    destroy() {
      sheets.disconnect();
      layer.destroy();
    },
  };
}

/**
 * An asterisk at the right margin of each changed line on the sheets in view while the changes are shown as
 * asterisks only; nothing otherwise, and nothing in a view without pages.
 */
export function changeMarksPlugin(): Plugin {
  return new Plugin({ view: changeMarksView });
}
