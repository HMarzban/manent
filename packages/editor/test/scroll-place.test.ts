import { expect, test } from "bun:test";
import { schema } from "@manent/schema";
import { Fragment } from "prosemirror-model";
import type { Node } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { ScrollPorts } from "../src/index.ts";
import {
  blockPos,
  blockTopPx,
  paginationKey,
  placeOf,
  restorePlace,
  savedPlaceOf,
} from "../src/index.ts";
import { docOf, script, state } from "./docs.ts";

/** A view as a saved place reads and sets it: its state, replaced by each dispatch. No DOM is needed. */
function viewOf(start: EditorState): EditorView {
  const view = {
    state: start,
    dispatch: (tr: Transaction) => {
      view.state = view.state.apply(tr);
    },
  };
  // a stand-in for the two members the functions under test use
  return view as unknown as EditorView;
}

/** Ports over a scroller that only scrolls; the top block, the zoom and each block's top are given. */
function portsOf(
  top: { block: number; offsetPx: number } | null,
  zoom: number,
  blockTop: (block: number) => number | null = () => null,
): { ports: ScrollPorts; scroller: { scrollTop: number } } {
  const scroller = {
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: 100 }),
  };
  return {
    scroller,
    ports: {
      // a stand-in for the members of an element the functions under test use
      scroller: () => scroller as unknown as HTMLElement,
      zoom: () => zoom,
      caretTop: () => null,
      topBlock: () => top,
      blockTop: (_, block) => blockTop(block),
    },
  };
}

const at = (s: EditorState, block: number, offset: number): EditorState => {
  const pos = blockPos(paginationKey.getState(s)!.index, block) + 1 + offset;
  return s.apply(s.tr.setSelection(TextSelection.create(s.doc, pos)));
};

/** The document with `count` one-line actions before every block, in a section of their own. */
function withSectionFirst(doc: Node, count: number): Node {
  const lines = Array.from({ length: count }, (_, i) =>
    schema.node(
      "block",
      { id: `first${String(i).padStart(11, "0")}`, type: "action" },
      schema.text(`A new line ${i}.`),
    ),
  );
  return doc.copy(
    Fragment.from(schema.node("section", null, lines)).append(doc.content),
  );
}

test("a place is block ids and offsets, and comes back after the blocks above it changed", () => {
  const doc = script(300);
  const opened = at(state(doc), 120, 3);
  const saved = savedPlaceOf(
    viewOf(opened),
    portsOf({ block: 118, offsetPx: 60 }, 1.5).ports,
  );
  const { blocks } = paginationKey.getState(opened)!.index;
  expect(saved).toEqual({
    anchor: { blockId: blocks[120]!.id, offset: 3 },
    head: { blockId: blocks[120]!.id, offset: 3 },
    top: { blockId: blocks[118]!.id, offsetPx: 40 },
  });
  const reopened = viewOf(state(withSectionFirst(doc, 50)));
  const { ports, scroller } = portsOf({ block: 0, offsetPx: -96 * 1.5 }, 1.5);
  restorePlace(reopened, ports, saved!);
  const { pagination, settings } = paginationKey.getState(reopened.state)!;
  expect(placeOf(reopened.state)).toEqual({
    anchor: saved!.anchor,
    head: saved!.head,
    at: 170,
  });
  expect(scroller.scrollTop).toBe(
    (blockTopPx(pagination, settings.engine, 0, 168) + 96 + 40) * 1.5,
  );
});

test("a place whose blocks are gone opens at the start", () => {
  const view = viewOf(at(state(script(300)), 200, 4));
  const { ports, scroller } = portsOf({ block: 0, offsetPx: 0 }, 1);
  restorePlace(view, ports, {
    anchor: { blockId: "gone_block", offset: 3 },
    head: { blockId: "gone_block", offset: 3 },
    top: { blockId: "gone_block", offsetPx: 40 },
  });
  expect([view.state.selection.from, view.state.selection.to]).toEqual([2, 2]);
  expect(scroller.scrollTop).toBe(0);
});

test("without pages a place comes back by the top block's own position", () => {
  const doc = docOf([
    ["one", "two"],
    ["three", "four"],
  ]);
  const view = viewOf(EditorState.create({ doc }));
  const { ports, scroller } = portsOf({ block: 0, offsetPx: 0 }, 2, (block) =>
    block === 3 ? 700 : null,
  );
  restorePlace(view, ports, {
    anchor: { blockId: "b000000000000003", offset: 2 },
    head: { blockId: "b000000000000003", offset: 4 },
    top: { blockId: "b000000000000003", offsetPx: 10 },
  });
  expect([view.state.selection.anchor, view.state.selection.head]).toEqual([
    23, 25,
  ]);
  expect(scroller.scrollTop).toBe(700 - 100 + 10 * 2);
});
