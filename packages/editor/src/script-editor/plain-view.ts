// The editor of a script without pages (Ink): section editing, the edge keys and the kept sections, and no pagination.
import { fontRanges } from "@manent/pagination";
import type { Node } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import type { Plugin, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { faceDescriptors, loadScriptFonts } from "../page/fonts.ts";
import type { PageViewPorts } from "../pagination/page-view.ts";
import type { SectionOptions } from "../sections/commands.ts";
import { edgeKeysPlugin } from "../sections/edge-keys.ts";
import { keepPlugin } from "../sections/keep.ts";
import { sectionEditingPlugin } from "../sections/plugin.ts";
import { PLAIN_CSS, PLAIN_VIEW_CLASS } from "./plain-css.ts";

/**
 * A view of `doc` appended to `place` after its styles, with `before`, section editing, the edge keys, the kept
 * sections and then `plugins`. The script faces are loaded, and the text is never held back for them.
 */
export function mountPlainView(
  options: SectionOptions & {
    place: HTMLElement;
    doc: Node;
    ports: PageViewPorts;
    before: readonly Plugin[];
    plugins: readonly Plugin[];
    dispatchTransaction(view: EditorView, tr: Transaction): void;
    editable(): boolean;
    spelling(): boolean;
  },
): { view: EditorView; destroy(): void } {
  const { ports } = options;
  void loadScriptFonts({
    fonts: ports.fonts,
    makeFace: ports.makeFace,
    faces: faceDescriptors(fontRanges("latin"), fontRanges("latin-ext")),
    wait: ports.wait,
  });
  const style = options.place.ownerDocument.createElement("style");
  style.textContent = PLAIN_CSS;
  options.place.append(style);
  const view: EditorView = new EditorView(options.place, {
    state: EditorState.create({
      doc: options.doc,
      plugins: [
        ...options.before,
        sectionEditingPlugin(options),
        edgeKeysPlugin(),
        keepPlugin(),
        ...options.plugins,
      ],
    }),
    dispatchTransaction: (tr) => options.dispatchTransaction(view, tr),
    editable: options.editable,
    attributes: () => ({
      class: PLAIN_VIEW_CLASS,
      spellcheck: String(options.spelling()),
    }),
  });
  return {
    view,
    destroy() {
      view.destroy();
      style.remove();
    },
  };
}
