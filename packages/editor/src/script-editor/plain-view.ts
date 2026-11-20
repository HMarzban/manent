// The editor of a script without pages (Ink): section editing, the edge keys and the kept sections, and no pagination.
import type { Node } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import type { Plugin, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { SectionOptions } from "../sections/commands.ts";
import { edgeKeysPlugin } from "../sections/edge-keys.ts";
import { keepPlugin } from "../sections/keep.ts";
import { sectionEditingPlugin } from "../sections/plugin.ts";

/** A view of `doc` appended to `place`, with `before`, section editing, the edge keys, the kept sections and then `plugins`. */
export function mountPlainView(
  options: SectionOptions & {
    place: HTMLElement;
    doc: Node;
    before: readonly Plugin[];
    plugins: readonly Plugin[];
    dispatchTransaction(view: EditorView, tr: Transaction): void;
    editable(): boolean;
    spelling(): boolean;
  },
): { view: EditorView; destroy(): void } {
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
    attributes: () => ({ spellcheck: String(options.spelling()) }),
  });
  return {
    view,
    destroy() {
      view.destroy();
    },
  };
}
