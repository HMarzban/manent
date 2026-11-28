// Print-clean graphic NodeView inside `.mn-pages`: fixed `--graphic-lines` box height, inline editable caption,
// `--page-*` tokens only, and zero paper chrome buttons except a quiet `Try again` control on missing assets.
import {
  GRAPHIC_MAX_HEIGHT_LINES,
  GRAPHIC_MIN_HEIGHT_LINES,
  renderedType,
} from "@manent/schema";
import type { GraphicAttrs, GraphicKind } from "@manent/schema";
import type { Node as PMNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { NodeView, NodeViewConstructor } from "prosemirror-view";

const DEFAULT_GRAPHIC_LINES = 6;
const UNSPELLED_TYPES: readonly string[] = [
  "scene_heading",
  "character",
  "slug",
];

const KIND_BADGE: Record<GraphicKind, string> = {
  image: "GRAPHIC",
  lower_third: "LOWER THIRD",
  ots: "OTS",
  full_screen: "FULL SCREEN",
};

/** Resolves stored project asset ids to renderable object URLs for the editor's graphic blocks. */
export interface GraphicAssetPort {
  resolveUrl(assetId: string): Promise<string | null>;
}

/** Styles for `.mn-graphic` blocks inside `.mn-pages`, using only `--page-*` and `--geo-*` tokens. */
export const GRAPHIC_CSS = [
  ".mn-pages p.mn-graphic { display: block; }",
  ".mn-pages .mn-graphic-box {",
  "  display: flex; flex-direction: column; align-items: center; justify-content: center;",
  "  box-sizing: border-box; width: 100%;",
  "  height: calc(var(--graphic-lines, 6) * var(--geo-line));",
  "  overflow: hidden; border: 1px solid var(--page-edge);",
  "  background: var(--page-paper); color: var(--page-ink); user-select: none;",
  "}",
  '.mn-pages .mn-graphic-box[data-state="loading"] { background: var(--page-skeleton); }',
  '.mn-pages .mn-graphic-box[data-kind="lower_third"],',
  '.mn-pages .mn-graphic-box[data-kind="ots"],',
  '.mn-pages .mn-graphic-box[data-kind="full_screen"] {',
  "  align-items: flex-start; justify-content: flex-start;",
  "  padding: calc(var(--geo-line) * 0.25) var(--geo-cell);",
  "}",
  ".mn-pages .mn-graphic-img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }",
  ".mn-pages .mn-graphic-badge {",
  "  font-size: 0.85em; line-height: var(--geo-line); letter-spacing: 0.04em;",
  "  text-transform: uppercase; color: var(--page-ink);",
  "  border-bottom: 1px solid var(--page-edge); margin-bottom: calc(var(--geo-line) * 0.25);",
  "}",
  ".mn-pages .mn-graphic-placeholder {",
  "  display: flex; flex-direction: column; align-items: center; justify-content: center;",
  "  gap: calc(var(--geo-line) * 0.25); padding: 0 var(--geo-cell);",
  "  text-align: center; color: var(--page-ink);",
  "}",
  ".mn-pages .mn-graphic-retry {",
  "  font: inherit; color: var(--page-ink); background: var(--page-paper);",
  "  border: 1px solid var(--page-edge); padding: 0 calc(var(--geo-cell) * 0.75); cursor: pointer;",
  "}",
  ".mn-pages .mn-graphic-caption { display: block; min-height: 0; }",
  ".mn-pages .mn-graphic-caption:has(> br.ProseMirror-trailingBreak:only-child) { font-size: 0; line-height: 0; }",
  ".mn-pages p.mn-graphic[data-selected] .mn-graphic-box {",
  "  outline: 1px solid var(--page-ink); outline-offset: -1px;",
  "}",
].join("\n");

function clampLines(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw))
    return DEFAULT_GRAPHIC_LINES;
  return Math.min(
    GRAPHIC_MAX_HEIGHT_LINES,
    Math.max(GRAPHIC_MIN_HEIGHT_LINES, Math.floor(raw)),
  );
}

function readGraphicAttrs(node: PMNode): GraphicAttrs {
  const raw: unknown = node.attrs.graphic;
  if (typeof raw === "object" && raw !== null) {
    const rec = raw as Record<string, unknown>;
    const kind: GraphicKind =
      rec.kind === "lower_third" ||
      rec.kind === "ots" ||
      rec.kind === "full_screen"
        ? rec.kind
        : "image";
    return {
      kind,
      assetId: typeof rec.assetId === "string" ? rec.assetId : null,
      heightLines: clampLines(rec.heightLines),
      label: typeof rec.label === "string" ? rec.label : "",
      alt: typeof rec.alt === "string" ? rec.alt : "",
      aspectWidth: typeof rec.aspectWidth === "number" ? rec.aspectWidth : null,
      aspectHeight:
        typeof rec.aspectHeight === "number" ? rec.aspectHeight : null,
    };
  }
  return {
    kind: "image",
    assetId: null,
    heightLines: DEFAULT_GRAPHIC_LINES,
    label: "",
    alt: "",
    aspectWidth: null,
    aspectHeight: null,
  };
}

function syncPlainBlockAttrs(
  dom: HTMLElement,
  node: PMNode,
  prevTypeClass: string | null,
): string {
  const type = typeof node.attrs.type === "string" ? node.attrs.type : "";
  const id = typeof node.attrs.id === "string" ? node.attrs.id : null;
  const nextTypeClass = `el-${renderedType(type)}`;
  if (prevTypeClass !== null && prevTypeClass !== nextTypeClass) {
    dom.classList.remove(prevTypeClass);
  }
  dom.classList.add("el", nextTypeClass);
  dom.setAttribute("data-type", type);
  if (id !== null) dom.setAttribute("data-id", id);
  else dom.removeAttribute("data-id");
  if (UNSPELLED_TYPES.includes(type)) dom.setAttribute("spellcheck", "false");
  else dom.removeAttribute("spellcheck");
  const firstLine = node.attrs.firstLine;
  const align = node.attrs.align;
  if (
    type === "body" &&
    (align === null || align === undefined || align === "left") &&
    (firstLine === "flush" ||
      firstLine === "drop_cap" ||
      firstLine === "raised_cap")
  ) {
    dom.setAttribute("data-first-line", firstLine);
  } else {
    dom.removeAttribute("data-first-line");
  }
  return nextTypeClass;
}

function createPlainBlockView(initial: PMNode, doc: Document): NodeView {
  let current = initial;
  const dom = doc.createElement("p");
  let typeClass = syncPlainBlockAttrs(dom, current, null);
  return {
    dom,
    contentDOM: dom,
    update(next) {
      if (next.type !== current.type || next.attrs.type === "graphic")
        return false;
      current = next;
      typeClass = syncPlainBlockAttrs(dom, current, typeClass);
      return true;
    },
  };
}

function createGraphicBlockView(
  initial: PMNode,
  doc: Document,
  assets?: GraphicAssetPort,
): NodeView {
  let current = initial;
  let attrs = readGraphicAttrs(initial);
  let loadedAssetId: string | null = null;
  let requestSeq = 0;
  let destroyed = false;

  const dom = doc.createElement("p");
  const box = doc.createElement("span");
  box.className = "mn-graphic-box";
  box.setAttribute("contenteditable", "false");
  const caption = doc.createElement("span");
  caption.className = "mn-graphic-caption";
  dom.append(box, caption);

  const syncOuterAttrs = (node: PMNode, graphic: GraphicAttrs): void => {
    dom.classList.add("el", "el-graphic", "mn-graphic");
    dom.setAttribute("data-type", "graphic");
    if (typeof node.attrs.id === "string")
      dom.setAttribute("data-id", node.attrs.id);
    else dom.removeAttribute("data-id");
    dom.setAttribute("data-graphic-kind", graphic.kind);
    dom.setAttribute("data-graphic-lines", String(graphic.heightLines));
    dom.style.setProperty("--graphic-lines", String(graphic.heightLines));
    box.setAttribute("data-kind", graphic.kind);
  };

  const makeBadge = (kind: GraphicKind): HTMLElement => {
    const badge = doc.createElement("span");
    badge.className = "mn-graphic-badge";
    badge.textContent = KIND_BADGE[kind];
    return badge;
  };

  const renderPlaceholder = (
    state: "empty" | "loading" | "missing",
    message: string,
    withRetry: boolean,
  ): void => {
    box.setAttribute("data-state", state);
    box.replaceChildren();
    const wrap = doc.createElement("span");
    wrap.className = "mn-graphic-placeholder";
    if (attrs.kind !== "image") wrap.append(makeBadge(attrs.kind));
    const note = doc.createElement("span");
    note.className = "mn-graphic-note";
    note.textContent = message;
    wrap.append(note);
    if (withRetry) {
      const retry = doc.createElement("button");
      retry.type = "button";
      retry.className = "mn-graphic-retry";
      retry.textContent = "Try again";
      retry.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        loadAsset();
      });
      wrap.append(retry);
    }
    box.append(wrap);
  };

  const renderImage = (url: string): void => {
    box.setAttribute("data-state", "ready");
    box.replaceChildren();
    if (attrs.kind !== "image") box.append(makeBadge(attrs.kind));
    const img = doc.createElement("img");
    img.className = "mn-graphic-img";
    img.src = url;
    img.alt = attrs.alt || attrs.label || KIND_BADGE[attrs.kind];
    box.append(img);
  };

  const renderChyron = (): void => {
    box.setAttribute("data-state", "ready");
    box.replaceChildren();
    box.append(makeBadge(attrs.kind));
    if (attrs.label !== "") {
      const label = doc.createElement("span");
      label.className = "mn-graphic-label";
      label.textContent = attrs.label;
      box.append(label);
    }
  };

  const loadAsset = (): void => {
    requestSeq += 1;
    const seq = requestSeq;
    const assetId = attrs.assetId;
    loadedAssetId = assetId;
    if (assetId === null) {
      if (attrs.kind === "image") {
        renderPlaceholder("empty", attrs.label || "Graphic", false);
      } else {
        renderChyron();
      }
      return;
    }
    if (assets === undefined) {
      renderPlaceholder("missing", attrs.label || "Graphic unavailable", false);
      return;
    }
    renderPlaceholder("loading", attrs.label || "Loading graphic", false);
    void assets
      .resolveUrl(assetId)
      .then((url) => {
        if (destroyed || seq !== requestSeq) return;
        if (url === null) {
          renderPlaceholder(
            "missing",
            attrs.label || "Graphic unavailable",
            true,
          );
          return;
        }
        renderImage(url);
      })
      .catch(() => {
        if (destroyed || seq !== requestSeq) return;
        renderPlaceholder(
          "missing",
          attrs.label || "Graphic unavailable",
          true,
        );
      });
  };

  syncOuterAttrs(current, attrs);
  loadAsset();

  return {
    dom,
    contentDOM: caption,
    selectNode() {
      dom.setAttribute("data-selected", "");
    },
    deselectNode() {
      dom.removeAttribute("data-selected");
    },
    stopEvent(event) {
      const target = event.target;
      return (
        target instanceof HTMLElement &&
        target.closest(".mn-graphic-retry") !== null
      );
    },
    ignoreMutation(mutation) {
      if (mutation.target === box || box.contains(mutation.target)) return true;
      return mutation.target === dom && mutation.type === "attributes";
    },
    update(next) {
      if (next.type !== current.type || next.attrs.type !== "graphic")
        return false;
      const nextAttrs = readGraphicAttrs(next);
      const assetChanged = nextAttrs.assetId !== loadedAssetId;
      const visualChanged =
        nextAttrs.kind !== attrs.kind ||
        nextAttrs.label !== attrs.label ||
        nextAttrs.alt !== attrs.alt;
      current = next;
      attrs = nextAttrs;
      syncOuterAttrs(current, attrs);
      if (assetChanged) {
        loadAsset();
      } else if (visualChanged) {
        const img = box.querySelector<HTMLImageElement>(".mn-graphic-img");
        if (img !== null && attrs.assetId !== null) {
          renderImage(img.src);
        } else if (attrs.assetId === null) {
          loadAsset();
        }
      }
      return true;
    },
    destroy() {
      destroyed = true;
      requestSeq += 1;
    },
  };
}

/** ProseMirror `block` NodeView: lightweight `<p>` for script blocks, print-clean box + caption for `"graphic"`. */
export function blockNodeView(assets?: GraphicAssetPort): NodeViewConstructor {
  return (node, view) => {
    const doc = view.dom.ownerDocument;
    return node.attrs.type === "graphic"
      ? createGraphicBlockView(node, doc, assets)
      : createPlainBlockView(node, doc);
  };
}

const graphicSelectionKey = new PluginKey<DecorationSet>("graphic-selection");

function selectedGraphics(state: EditorState): DecorationSet {
  const { from, to } = state.selection;
  const decorations: Decoration[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === "block" && node.attrs.type === "graphic") {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, { "data-selected": "" }),
      );
      return false;
    }
    return true;
  });
  return decorations.length === 0
    ? DecorationSet.empty
    : DecorationSet.create(state.doc, decorations);
}

/** Marks any graphic block intersecting the selection with `data-selected` for outline and forced-colours support. */
export function graphicSelectionPlugin(): Plugin {
  return new Plugin<DecorationSet>({
    key: graphicSelectionKey,
    state: {
      init: (_, state) => selectedGraphics(state),
      apply: (tr, prev, _, next) =>
        tr.selectionSet || tr.docChanged ? selectedGraphics(next) : prev,
    },
    props: {
      decorations: (state) => graphicSelectionKey.getState(state),
    },
  });
}
