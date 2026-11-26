// Editor commands for inserting and updating inline `"graphic"` blocks.
import {
  DEFAULT_BLOCK_ATTRS,
  GRAPHIC_MAX_ALT_LENGTH,
  GRAPHIC_MAX_HEIGHT_LINES,
  GRAPHIC_MAX_LABEL_LENGTH,
  GRAPHIC_MIN_HEIGHT_LINES,
  schema,
} from "@manent/schema";
import type { GraphicAttrs, GraphicKind, IdSource } from "@manent/schema";
import type { Node as PMNode } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import type { Command, EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

const DEFAULT_HEIGHT_LINES = 6;

export interface InsertGraphicInput {
  readonly kind?: GraphicKind;
  readonly assetId?: string | null;
  readonly heightLines?: number;
  readonly label?: string;
  readonly alt?: string;
  readonly aspectWidth?: number | null;
  readonly aspectHeight?: number | null;
  readonly caption?: string;
}

export type UpdateGraphicAttrsPatch = Partial<GraphicAttrs>;

export interface GraphicCommands {
  insertGraphic(input?: InsertGraphicInput): boolean;
  updateGraphicAttrs(patch: UpdateGraphicAttrsPatch, blockId?: string): boolean;
  setGraphicHeightLines(heightLines: number, blockId?: string): boolean;
  removeGraphicImage(blockId?: string): boolean;
}

function clampHeightLines(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    return DEFAULT_HEIGHT_LINES;
  return Math.min(
    GRAPHIC_MAX_HEIGHT_LINES,
    Math.max(GRAPHIC_MIN_HEIGHT_LINES, Math.floor(value)),
  );
}

function trimText(value: string | undefined, max: number): string {
  return value === undefined ? "" : value.slice(0, max);
}

function normalizeGraphicAttrs(
  input: Partial<GraphicAttrs>,
  base?: GraphicAttrs,
): GraphicAttrs {
  return {
    kind: input.kind ?? base?.kind ?? "image",
    assetId:
      input.assetId !== undefined ? input.assetId : (base?.assetId ?? null),
    heightLines: clampHeightLines(
      input.heightLines ?? base?.heightLines ?? DEFAULT_HEIGHT_LINES,
    ),
    label: trimText(
      input.label !== undefined ? input.label : base?.label,
      GRAPHIC_MAX_LABEL_LENGTH,
    ),
    alt: trimText(
      input.alt !== undefined ? input.alt : base?.alt,
      GRAPHIC_MAX_ALT_LENGTH,
    ),
    aspectWidth:
      input.aspectWidth !== undefined
        ? input.aspectWidth
        : (base?.aspectWidth ?? null),
    aspectHeight:
      input.aspectHeight !== undefined
        ? input.aspectHeight
        : (base?.aspectHeight ?? null),
  };
}

function isSameGraphicAttrs(a: GraphicAttrs, b: GraphicAttrs): boolean {
  return (
    a.kind === b.kind &&
    a.assetId === b.assetId &&
    a.heightLines === b.heightLines &&
    a.label === b.label &&
    a.alt === b.alt &&
    a.aspectWidth === b.aspectWidth &&
    a.aspectHeight === b.aspectHeight
  );
}

function findBlock(
  state: EditorState,
  blockId?: string,
): { pos: number; node: PMNode } | null {
  if (blockId !== undefined) {
    let found: { pos: number; node: PMNode } | null = null;
    state.doc.descendants((node, pos) => {
      if (found !== null) return false;
      if (node.type === schema.nodes.block) {
        if (node.attrs.id === blockId) found = { pos, node };
        return false;
      }
      return true;
    });
    return found;
  }
  const $from = state.selection.$from;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type === schema.nodes.block)
      return { pos: $from.before(depth), node };
  }
  return null;
}

/** Inserts a `"graphic"` block (converting an empty non-graphic block in place, or appending after the current block). */
export function insertGraphic(
  ids: IdSource,
  input: InsertGraphicInput = {},
): Command {
  return (state, dispatch) => {
    const current = findBlock(state);
    if (current === null) return false;
    const graphic = normalizeGraphicAttrs(input);
    const caption = input.caption ?? "";
    const content = caption === "" ? undefined : schema.text(caption);
    if (dispatch === undefined) return true;

    const replaceInPlace =
      current.node.attrs.type !== "graphic" && current.node.textContent === "";
    if (replaceInPlace) {
      const attrs = {
        ...DEFAULT_BLOCK_ATTRS,
        id:
          typeof current.node.attrs.id === "string"
            ? current.node.attrs.id
            : ids(),
        type: "graphic",
        graphic,
      };
      const block = schema.nodes.block.create(attrs, content);
      const tr = state.tr.replaceWith(
        current.pos,
        current.pos + current.node.nodeSize,
        block,
      );
      const caret = current.pos + 1 + caption.length;
      dispatch(
        tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView(),
      );
      return true;
    }

    const insertPos = current.pos + current.node.nodeSize;
    const block = schema.nodes.block.create(
      { ...DEFAULT_BLOCK_ATTRS, id: ids(), type: "graphic", graphic },
      content,
    );
    const tr = state.tr.insert(insertPos, block);
    const caret = insertPos + 1 + caption.length;
    dispatch(
      tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView(),
    );
    return true;
  };
}

/** Updates one or more fields of a graphic block's `attrs.graphic`, preserving canonical 7-key shape. */
export function updateGraphicAttrs(
  patch: UpdateGraphicAttrsPatch,
  blockId?: string,
): Command {
  return (state, dispatch) => {
    const target = findBlock(state, blockId);
    if (target === null || target.node.attrs.type !== "graphic") return false;
    const base = normalizeGraphicAttrs(
      typeof target.node.attrs.graphic === "object" &&
        target.node.attrs.graphic !== null
        ? (target.node.attrs.graphic as Partial<GraphicAttrs>)
        : {},
    );
    const next = normalizeGraphicAttrs(patch, base);
    if (isSameGraphicAttrs(base, next)) return false;
    dispatch?.(state.tr.setNodeAttribute(target.pos, "graphic", next));
    return true;
  };
}

/** Sets a graphic block's box height in lines (clamped to 2..24). */
export function setGraphicHeightLines(
  heightLines: number,
  blockId?: string,
): Command {
  return updateGraphicAttrs({ heightLines }, blockId);
}

/** Clears the attached asset reference and aspect metadata on a graphic block while keeping the block and caption. */
export function removeGraphicImage(blockId?: string): Command {
  return updateGraphicAttrs(
    { assetId: null, aspectWidth: null, aspectHeight: null },
    blockId,
  );
}

/** Binds graphic commands onto an editor view with an editability guard. */
export function createGraphicCommands(
  view: EditorView,
  ids: IdSource,
  isEditable: () => boolean,
): GraphicCommands {
  const run = (command: Command): boolean =>
    isEditable() ? command(view.state, view.dispatch, view) : false;
  return {
    insertGraphic: (input) => run(insertGraphic(ids, input)),
    updateGraphicAttrs: (patch, blockId) =>
      run(updateGraphicAttrs(patch, blockId)),
    setGraphicHeightLines: (heightLines, blockId) =>
      run(setGraphicHeightLines(heightLines, blockId)),
    removeGraphicImage: (blockId) => run(removeGraphicImage(blockId)),
  };
}
