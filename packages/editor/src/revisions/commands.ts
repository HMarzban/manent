// Mark revised and Clear revised over the blocks the selection touches, and omitting a scene or bringing it back.
import { overrideKey } from "@manent/revisions";
import type { Node } from "prosemirror-model";
import type { Command, EditorState } from "prosemirror-state";
import { contentHashOf, productionOf } from "./derive.ts";
import { isNumberedHeading } from "./numbers.ts";

/** Each block the selection touches, with its position; a caret touches its own block. */
function touchedBlocks(state: EditorState): { node: Node; pos: number }[] {
  const { from, to } = state.selection;
  const blocks: { node: Node; pos: number }[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "block") return true;
    blocks.push({ node, pos });
    return false;
  });
  return blocks;
}

/** Writes `value` of each touched block under its override key in the script's map. */
function writeOverrides(value: (node: Node) => string): Command {
  return (state, dispatch) => {
    const production = productionOf(state);
    if (production === null) return false;
    const ids = touchedBlocks(state).flatMap(({ node }) => {
      const id: unknown = node.attrs.id;
      return typeof id === "string" ? [{ id, node }] : [];
    });
    if (ids.length === 0) return false;
    if (dispatch === undefined) return true;
    const { port, view } = production;
    for (const { id, node } of ids)
      port.overrides.set(overrideKey(view.setId, id), value(node));
    return true;
  };
}

/** An ordinary edit, undone as any other: `omitted` on each touched scene heading. */
function setOmitted(omitted: boolean): Command {
  return (state, dispatch) => {
    const tr = state.tr;
    for (const { node, pos } of touchedBlocks(state))
      if (isNumberedHeading(node.attrs.type) && node.attrs.omitted !== omitted)
        tr.setNodeAttribute(pos, "omitted", omitted);
    if (!tr.docChanged) return false;
    dispatch?.(tr);
    return true;
  };
}

export const markRevised: Command = writeOverrides(() => "marked");
export const clearRevised: Command = writeOverrides(
  (node) => `cleared@${contentHashOf(node)}`,
);
export const omitScene: Command = setOmitted(true);
export const bringBackScene: Command = setOmitted(false);
