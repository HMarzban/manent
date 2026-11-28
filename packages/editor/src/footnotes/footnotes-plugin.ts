// Live zero-drift superscript footnote callout decorations (`.mn-fn-ref`), built off the keystroke path.
import { schema } from "@manent/schema";
import type { FormatId } from "@manent/schema";
import type { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Timers } from "../script-editor/ports.ts";

const REFRESH_MS = 250;

export const footnotesKey = new PluginKey<DecorationSet>("manent-footnotes");

/** Builds zero-width superscript callout widgets at the end of each distinct `(blockId, footnoteId)` span. */
export function footnoteDecorations(doc: Node): DecorationSet {
  const widgets: Decoration[] = [];
  let ordinal = 0;
  doc.forEach((section, sectionOffset) => {
    const sectionStart = sectionOffset + 1;
    section.forEach((block, blockOffset) => {
      if (!block.isTextblock || block.content.size === 0) return;
      const blockStart = sectionStart + blockOffset + 1;
      const lastEndById = new Map<string, { end: number; text: string }>();
      const order: string[] = [];
      block.forEach((child, offset) => {
        if (!child.isText || child.marks.length === 0) return;
        for (const mark of child.marks) {
          if (mark.type !== schema.marks.footnote) continue;
          const id = typeof mark.attrs.id === "string" ? mark.attrs.id : "";
          if (id === "") continue;
          const text =
            typeof mark.attrs.text === "string" ? mark.attrs.text : "";
          if (!lastEndById.has(id)) order.push(id);
          lastEndById.set(id, {
            end: blockStart + offset + child.nodeSize,
            text,
          });
        }
      });
      for (const id of order) {
        const hit = lastEndById.get(id)!;
        ordinal++;
        const n = String(ordinal);
        const title = hit.text;
        widgets.push(
          Decoration.widget(
            hit.end,
            () => {
              const span = document.createElement("span");
              span.className = "mn-fn-ref";
              span.dataset["n"] = n;
              span.dataset["footnoteRef"] = id;
              span.setAttribute("aria-hidden", "true");
              if (title !== "") span.title = title;
              return span;
            },
            { side: 1, key: `fn-${id}-${n}` },
          ),
        );
      }
    });
  });
  return widgets.length === 0
    ? DecorationSet.empty
    : DecorationSet.create(doc, widgets);
}

/**
 * Keeps sequential superscript callout numbers (`1`, `2`, `3`…) attached to inline `footnote` marks.
 * Maps positions synchronously on edits and recomputes ordinals on a coalesced 250 ms timer (ADR 0031).
 */
export function footnotesPlugin(options: {
  timers: Timers;
  format(): FormatId;
}): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: footnotesKey,
    state: {
      init: (_, state) =>
        options.format() === "manuscript"
          ? footnoteDecorations(state.doc)
          : DecorationSet.empty,
      apply(tr, prev) {
        const next: unknown = tr.getMeta(footnotesKey);
        if (next instanceof DecorationSet) return next;
        return tr.docChanged ? prev.map(tr.mapping, tr.doc) : prev;
      },
    },
    props: {
      decorations: (state) =>
        footnotesKey.getState(state) ?? DecorationSet.empty,
    },
    view(view) {
      let cancel: (() => void) | null = null;
      return {
        update(_, prev) {
          if (view.state.doc === prev.doc) return;
          if (options.format() !== "manuscript") return;
          cancel?.();
          cancel = options.timers.schedule(() => {
            cancel = null;
            if (view.isDestroyed) return;
            const next = footnoteDecorations(view.state.doc);
            const cur = footnotesKey.getState(view.state);
            if (next === DecorationSet.empty && cur === DecorationSet.empty)
              return;
            view.dispatch(
              view.state.tr
                .setMeta(footnotesKey, next)
                .setMeta("addToHistory", false),
            );
          }, REFRESH_MS);
        },
        destroy() {
          cancel?.();
          cancel = null;
        },
      };
    },
  });
}
