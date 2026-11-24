// Live caret-element inspection and block-override restoration for the Ruler's "Apply to every {element}".
import { specKey } from "@manent/pagination";
import { schema } from "@manent/schema";
import { liveEditor, livePagination } from "./live-editor.ts";

export interface CaretElementInfo {
  readonly specKey: string;
  readonly blockId: string;
  readonly elementIndent: number;
  readonly elementWidth: number;
  readonly ownIndent: number | null;
  readonly ownWidth: number | null;
  readonly allBlocksSelected: boolean;
}

export interface BlockLayoutSnapshot {
  readonly blockId: string;
  readonly indent: number | null;
  readonly width: number | null;
}

const asMeasure = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Current caret block's element key, the element's own indent/width (in cells), the block's own overrides, and
 * whether the selection covers every block of that element in the script (and nothing else).
 */
export function readCaretElementInfo(docId: string): CaretElementInfo | null {
  const editor = liveEditor(docId);
  const pagination = livePagination(docId);
  if (editor === null || pagination === null) return null;
  const { doc, selection } = editor.view.state;
  const { $head, from, to, empty } = selection;
  const node = $head.parent.isTextblock ? $head.parent : null;
  if (node === null || node.type !== schema.nodes.block) return null;
  const blockId = typeof node.attrs.id === "string" ? node.attrs.id : "";
  const type =
    typeof node.attrs.type === "string" ? node.attrs.type : "general";
  const kind = typeof node.attrs.kind === "string" ? node.attrs.kind : null;
  const key = specKey(type, kind);
  const spec = pagination.profile.elements[key];

  let allBlocksSelected = false;
  if (!empty) {
    let totalOfKey = 0;
    let selectedOfKey = 0;
    let touchedOther = false;
    doc.descendants((child, pos) => {
      if (child.type !== schema.nodes.block) return true;
      const childType =
        typeof child.attrs.type === "string" ? child.attrs.type : "general";
      const childKind =
        typeof child.attrs.kind === "string" ? child.attrs.kind : null;
      const childKey = specKey(childType, childKind);
      const touched = pos < to && pos + child.nodeSize > from;
      if (childKey === key) {
        totalOfKey += 1;
        if (touched) selectedOfKey += 1;
      } else if (touched) {
        touchedOther = true;
      }
      return false;
    });
    allBlocksSelected =
      !touchedOther && totalOfKey > 0 && selectedOfKey === totalOfKey;
  }

  return {
    specKey: key,
    blockId,
    elementIndent: spec.indent,
    elementWidth: spec.width,
    ownIndent: asMeasure(node.attrs.indent),
    ownWidth: asMeasure(node.attrs.width),
    allBlocksSelected,
  };
}

/** Snapshot of own `indent` and `width` for every block currently touched by the editor selection. */
export function snapshotSelectedOverrides(
  docId: string,
): BlockLayoutSnapshot[] {
  const editor = liveEditor(docId);
  if (editor === null) return [];
  const { doc, selection } = editor.view.state;
  const snapshots: BlockLayoutSnapshot[] = [];
  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (node.type !== schema.nodes.block) return true;
    if (typeof node.attrs.id === "string") {
      snapshots.push({
        blockId: node.attrs.id,
        indent: asMeasure(node.attrs.indent),
        width: asMeasure(node.attrs.width),
      });
    }
    return false;
  });
  return snapshots;
}

/** Restores each block's own `indent` and `width` attributes recorded before "Apply to every {element}". */
export function restoreBlockOverrides(
  docId: string,
  snapshots: readonly BlockLayoutSnapshot[],
): void {
  const editor = liveEditor(docId);
  if (editor === null || !editor.editable || snapshots.length === 0) return;
  const byId = new Map(snapshots.map((item) => [item.blockId, item]));
  const { state, dispatch } = editor.view;
  const tr = state.tr;
  state.doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.block) return true;
    const id = typeof node.attrs.id === "string" ? node.attrs.id : "";
    const snap = byId.get(id);
    if (
      snap !== undefined &&
      (node.attrs.indent !== snap.indent || node.attrs.width !== snap.width)
    ) {
      tr.setNodeMarkup(pos, null, {
        ...node.attrs,
        indent: snap.indent,
        width: snap.width,
      });
    }
    return false;
  });
  if (tr.docChanged) dispatch(tr);
}
