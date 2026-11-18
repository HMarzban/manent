import { withDom } from "@manent/testkit/dom";
import { expect, spyOn, test } from "bun:test";
import { scriptBody, scriptDocFromJSON } from "@manent/crdt";
import { parseDoc } from "@manent/schema";
import fc from "fast-check";
import { Selection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { ySyncPluginKey } from "y-prosemirror";
import {
  bindDocument,
  hasNewerContent,
  isRemoteTransaction,
} from "../src/index.ts";
import {
  ID,
  SAMPLE,
  blocksOfView,
  bound,
  docWith,
  fakeTimers,
  flush,
  idOf,
  local,
  positionIn,
  setCaret,
  spyDispatch,
  twoClients,
  typeInto,
  updatesSentBy,
} from "./helpers.ts";

withDom();

const timers = fakeTimers();

const ELEMENTS = ["action", "character", "dialogue", "scene_heading"] as const;

type Edit =
  | { kind: "insert"; block: number; offset: number; text: string }
  | { kind: "enter"; block: number; offset: number }
  | { kind: "backspace"; block: number }
  | { kind: "element"; block: number; type: (typeof ELEMENTS)[number] }
  | {
      kind: "delete";
      block: number;
      offset: number;
      toBlock: number;
      toOffset: number;
    };

const index = fc.nat({ max: 40 });

const arbEdit: fc.Arbitrary<Edit> = fc.oneof(
  fc.record({
    kind: fc.constant("insert" as const),
    block: index,
    offset: index,
    text: fc.constantFrom("a", "Rain ", "é", "🌧", " falls"),
  }),
  fc.record({
    kind: fc.constant("enter" as const),
    block: index,
    offset: index,
  }),
  fc.record({ kind: fc.constant("backspace" as const), block: index }),
  fc.record({
    kind: fc.constant("element" as const),
    block: index,
    type: fc.constantFrom(...ELEMENTS),
  }),
  fc.record({
    kind: fc.constant("delete" as const),
    block: index,
    offset: index,
    toBlock: fc.nat({ max: 2 }),
    toOffset: index,
  }),
);

const arbEditPairs = fc.record({
  a: fc.array(arbEdit, { minLength: 1, maxLength: 20 }),
  b: fc.array(arbEdit, { minLength: 1, maxLength: 20 }),
});

/**
 * The position `offset` characters into block `block`, both taken modulo what
 * the view holds, moved off the middle of a surrogate pair as a caret would be.
 */
function placeOf(view: EditorView, block: number, offset: number): number {
  const blocks = blocksOfView(view);
  const target = blocks[block % blocks.length]!;
  const at = offset % (target.text.length + 1);
  const low = target.text.charCodeAt(at);
  return positionIn(
    view,
    target.id,
    low >= 0xdc00 && low <= 0xdfff ? at - 1 : at,
  );
}

/** Applies one edit as a person typing would; a new block takes its id from `newId`. */
function applyEdit(view: EditorView, edit: Edit, newId: () => string): void {
  const { tr, doc } = view.state;
  const pos = placeOf(view, edit.block, "offset" in edit ? edit.offset : 0);
  switch (edit.kind) {
    case "insert":
      view.dispatch(tr.insertText(edit.text, pos));
      return;
    case "enter": {
      const block = doc.resolve(pos).parent;
      view.dispatch(
        tr.split(pos, 1, [
          { type: block.type, attrs: { ...block.attrs, id: newId() } },
        ]),
      );
      return;
    }
    case "backspace": {
      const before = Selection.findFrom(doc.resolve(pos - 1), -1, true);
      if (before !== null && before.from < pos)
        view.dispatch(tr.delete(before.from, pos));
      return;
    }
    case "element": {
      const blockPos = pos - 1;
      const block = doc.nodeAt(blockPos)!;
      view.dispatch(
        tr.setNodeMarkup(blockPos, null, { ...block.attrs, type: edit.type }),
      );
      return;
    }
    case "delete": {
      const to = placeOf(view, edit.block + edit.toBlock, edit.toOffset);
      if (to > pos) view.dispatch(tr.delete(pos, to));
      return;
    }
    default:
      edit satisfies never;
  }
}

function applyEdits(
  view: EditorView,
  edits: readonly Edit[],
  prefix: string,
): void {
  let count = 0;
  const newId = () => `${prefix}${String(++count).padStart(15, "0")}`;
  for (const edit of edits) applyEdit(view, edit, newId);
}

test("the editor starts from the document the CRDT holds", () => {
  const doc = scriptDocFromJSON(SAMPLE);
  const r = bindDocument({
    document: local(doc),
    timers,
    undoRoots: ["script"],
  });
  expect([
    r.ok,
    r.ok && r.binding.doc.eq(parseDoc(scriptBody(doc).materialize())),
  ]).toEqual([true, true]);
});

test("a local edit becomes one update, and a remote one a transaction marked remote", () => {
  const [a, b] = twoClients(SAMPLE);
  const view = bound(b);
  const seen: boolean[] = [];
  spyDispatch(view, (tr) => seen.push(isRemoteTransaction(tr)));
  typeInto(view, positionIn(view, idOf(0)), "x");
  scriptBody(a).write((w) => w.insertText(idOf(1), 0, "y"));
  flush();
  expect([seen, updatesSentBy(b)]).toEqual([[false, true], 1]);
});

test("the sync plugin's view does no work on a selection change", () => {
  const view = bound(scriptDocFromJSON(SAMPLE));
  const writes = spyOn(
    ySyncPluginKey.getState(view.state).binding,
    "_prosemirrorChanged",
  );
  setCaret(view, positionIn(view, idOf(1), 4));
  const afterSelection = writes.mock.calls.length;
  typeInto(view, positionIn(view, idOf(1), 4), "x");
  expect([afterSelection, writes.mock.calls.length]).toEqual([0, 1]);
});

test("a document with newer content is shown, never bound", () => {
  const doc = scriptDocFromJSON(
    docWith({ id: ID, type: "action", glow: 3 }, "Rain"),
  );
  const before = doc.encodeState();
  const r = bindDocument({
    document: local(doc),
    timers,
    undoRoots: ["script"],
  });
  expect([
    r.ok,
    !r.ok && r.reason,
    !r.ok && r.doc.textContent,
    doc.encodeState(),
  ]).toEqual([false, "newer_content", "Rain", before]);
  expect(hasNewerContent(scriptDocFromJSON(SAMPLE))).toBe(false);
});

test("two replicas typing through their editors converge to equal documents", () => {
  fc.assert(
    fc.property(arbEditPairs, (edits) => {
      const [a, b] = twoClients(SAMPLE);
      const [va, vb] = [bound(a), bound(b)];
      applyEdits(va, edits.a, "a");
      applyEdits(vb, edits.b, "c");
      flush();
      expect(va.state.doc.eq(vb.state.doc)).toBe(true);
      expect(scriptBody(a).materialize()).toEqual(scriptBody(b).materialize());
      va.destroy();
      vb.destroy();
    }),
    { numRuns: 100 },
  );
});
