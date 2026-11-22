// Colours source lines by decorations: every line of an Ink script, and a game script's branching General lines.
// Never stored, and drawn by colour classes alone in a game script, so its pages are unchanged.
import type { FormatId } from "@manent/schema";
import type { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { DecorationSet } from "prosemirror-view";
import type { SourceMode } from "./classify.ts";

interface SourceState {
  /** Null while the format reads no line as source, or the line reader has not loaded. */
  readonly mode: SourceMode | null;
  readonly decorations: DecorationSet;
}

type SourceLines = typeof import("./source-lines.ts");

const sourceKey = new PluginKey<SourceState>("source");

const MODES: Readonly<Record<FormatId, SourceMode | null>> = Object.freeze({
  screenplay: null,
  multicam: null,
  animation: null,
  variety: null,
  game: "branching",
  ink: "ink",
  manuscript: null,
  stage_play: null,
});

/**
 * Colours the lines `format` reads as source; built whole when the view starts and when the format's mode changes.
 * The line reader and its styles, which go into `layer`, are loaded the first time a format reads lines as source.
 */
export function sourcePlugin(options: {
  format(): FormatId;
  layer: HTMLElement;
}): Plugin<SourceState> {
  let lines: SourceLines | null = null;
  let loading = false;
  const modeNow = (): SourceMode | null =>
    lines === null ? null : MODES[options.format()];
  const decorateAll = (doc: Node, mode: SourceMode | null): DecorationSet =>
    lines === null || mode === null
      ? DecorationSet.empty
      : lines.decorateAll(doc, mode);
  return new Plugin<SourceState>({
    key: sourceKey,
    state: {
      init: (_config, state) => ({
        mode: modeNow(),
        decorations: decorateAll(state.doc, modeNow()),
      }),
      apply(tr, value) {
        const mode = modeNow();
        if (mode !== value.mode)
          return { mode, decorations: decorateAll(tr.doc, mode) };
        if (!tr.docChanged || mode === null || lines === null) return value;
        return {
          mode,
          decorations: lines.decorateChange(value.decorations, tr, mode),
        };
      },
    },
    props: {
      decorations: (state) => sourceKey.getState(state)?.decorations ?? null,
    },
    view(view) {
      let destroyed = false;
      const load = (): void => {
        if (loading || MODES[options.format()] === null) return;
        loading = true;
        void Promise.all([
          import("./source-lines.ts"),
          import("./source-css.ts"),
        ]).then(([loaded, { SOURCE_CSS }]) => {
          lines = loaded;
          const style = options.layer.ownerDocument.createElement("style");
          style.textContent = SOURCE_CSS;
          options.layer.append(style);
          // a step of no change, so the state reads the lines with the reader now loaded
          if (!destroyed)
            view.dispatch(view.state.tr.setMeta("addToHistory", false));
        });
      };
      load();
      return {
        update: load,
        destroy() {
          destroyed = true;
        },
      };
    },
  });
}
