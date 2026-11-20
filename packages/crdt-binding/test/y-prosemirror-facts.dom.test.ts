// The y-prosemirror behaviour the binding is built around, pinned on the installed version.
import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import {
  FRAGMENT_NAME,
  createDoc,
  scriptBody,
  scriptDocFromJSON,
  yXmlFragmentForBinding,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { canonicalDoc, schema } from "@manent/schema";
import type { DocJSON, RawElement, RawText } from "@manent/schema";
import { Schema } from "prosemirror-model";
import type { Node } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  initProseMirrorDoc,
  prosemirrorToYDoc,
  prosemirrorToYXmlFragment,
  ySyncPlugin,
  ySyncPluginKey,
} from "y-prosemirror";
import {
  ID,
  bound,
  docWith,
  flush,
  idOf,
  line,
  positionIn,
  script,
  setCaret,
  spyDispatch,
  twoClients,
  typeInto,
} from "./helpers.ts";

withDom();

/** The schema with a node and a mark this build does not know. */
const newer = new Schema({
  nodes: schema.spec.nodes
    .update("section", {
      ...schema.spec.nodes.get("section"),
      content: "(block|foreign)+",
    })
    .addToEnd("foreign", { content: "text*" }),
  marks: schema.spec.marks.addToEnd("glow", {}),
});

/** A document whose one section holds what `content` builds with the newer schema. */
function newerDoc(content: (s: Schema) => Node[]): CrdtDoc {
  const doc = createDoc();
  prosemirrorToYXmlFragment(
    newer.node("doc", null, [newer.node("section", null, content(newer))]),
    yXmlFragmentForBinding(doc),
  );
  return doc;
}

const isText = (node: RawElement | RawText): node is RawText => "text" in node;

/** The first section's children as stored: each one's name and the text of its runs. */
function storedChildren(doc: CrdtDoc): [string, string[]][] {
  const section = scriptBody(doc).materializeRaw().content[0];
  if (section === undefined || isText(section)) return [];
  return section.content.map((child) => [
    child.type,
    isText(child)
      ? [child.text]
      : child.content.map((run) => (isText(run) ? run.text : run.type)),
  ]);
}

/** The first block's attributes as stored. */
function storedAttrs(doc: CrdtDoc): Record<string, unknown> {
  const section = scriptBody(doc).materializeRaw().content[0];
  const block =
    section === undefined || isText(section) ? undefined : section.content[0];
  return block === undefined || isText(block) ? {} : block.attrs;
}

/** The number of updates `fn` makes the document emit. */
function updatesDuring(doc: CrdtDoc, fn: () => void): number {
  let count = 0;
  const stop = doc.subscribe(() => count++);
  fn();
  stop();
  return count;
}

/** The section holding block `n` of script(); each holds 100 blocks. */
const sectionOfBlock = (n: number): number => Math.floor(n / 100);

const blockIndex = (section: number, j: number): number => section * 100 + j;

test("one Yjs is loaded, the one crdt uses", () => {
  const made = prosemirrorToYDoc(
    schema.node("doc", null, [
      schema.node("section", null, [schema.node("block")]),
    ]),
  ).getXmlFragment(FRAGMENT_NAME);
  expect(made instanceof yXmlFragmentForBinding(createDoc()).constructor).toBe(
    true,
  );
});

test("a ProseMirror view runs under the DOM test runner", () => {
  const view = bound(createDoc());
  typeInto(view, 0, "Hello");
  setCaret(view, 3);
  const keydown = new KeyboardEvent("keydown", { key: "a" });
  view.someProp("handleKeyDown", (handle) => handle(view, keydown));
  expect([view.state.doc.textContent, view.state.selection.head]).toEqual([
    "Hello",
    3,
  ]);
  view.destroy();
});

test("y-prosemirror stores a block as crdt's writer does", () => {
  const doc = createDoc();
  const view = bound(doc);
  typeInto(view, 0, "Hello");
  expect(scriptBody(doc).materialize()).toEqual(
    canonicalDoc(view.state.doc.toJSON() as DocJSON),
  );
});

test("a suggestion typed through the binding has crdt's storage key", () => {
  const doc = scriptDocFromJSON(
    docWith({ id: ID, type: "action" }, "Hello world"),
  );
  const view = bound(doc);
  const from = positionIn(view, ID, 6);
  view.dispatch(
    view.state.tr.addMark(
      from,
      from + 5,
      schema.marks.suggest_insert.create({
        id: "s1",
        authorUserId: "dana",
        at: 5,
      }),
    ),
  );
  const section = yXmlFragmentForBinding(doc).get(0);
  const block = "toArray" in section ? section.get(0) : null;
  const text = block !== null && "toArray" in block ? block.get(0) : null;
  const delta: { attributes?: Record<string, unknown> }[] =
    text !== null && "toDelta" in text ? text.toDelta() : [];
  expect(delta.map((op) => Object.keys(op.attributes ?? {}))).toEqual([
    [],
    ["suggest_insert--vfeNmJSG"],
  ]);
});

test("reading a document deletes what the schema cannot hold, before any view exists", () => {
  const foreign = newerDoc((s) => [
    s.node("block", { id: ID, type: "action" }, s.text("Rain")),
    s.node("foreign", null, s.text("Wind")),
  ]);
  const before = storedChildren(foreign);
  const updates = updatesDuring(foreign, () =>
    initProseMirrorDoc(yXmlFragmentForBinding(foreign), schema),
  );
  expect([before, storedChildren(foreign), updates]).toEqual([
    [
      ["block", ["Rain"]],
      ["foreign", ["Wind"]],
    ],
    [["block", ["Rain"]]],
    1,
  ]);

  const marked = newerDoc((s) => [
    s.node(
      "block",
      { id: ID, type: "action" },
      s.text("Rain", [s.mark("glow")]),
    ),
  ]);
  const markedUpdates = updatesDuring(marked, () =>
    initProseMirrorDoc(yXmlFragmentForBinding(marked), schema),
  );
  expect([storedChildren(marked), markedUpdates]).toEqual([[["block", []]], 1]);

  const attributed = scriptDocFromJSON(
    docWith({ id: ID, type: "action", glow: 3 }, "Rain"),
  );
  const fragment = yXmlFragmentForBinding(attributed);
  const { doc, mapping } = initProseMirrorDoc(fragment, schema);
  const glowBefore = storedAttrs(attributed).glow;
  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc,
      plugins: [ySyncPlugin(fragment, { mapping })],
    }),
  });
  typeInto(view, positionIn(view, ID, 4), "s");
  expect([glowBefore, Object.hasOwn(storedAttrs(attributed), "glow")]).toEqual([
    3,
    false,
  ]);
  view.destroy();
});

test("a remote change keeps every untouched node the same object", () => {
  const [a, b] = twoClients(script(300));
  const view = bound(b);
  const before = view.state.doc;
  scriptBody(a).write((w) => w.insertText(idOf(150), 0, "Rain "));
  flush();
  const after = view.state.doc;
  const changedSection = sectionOfBlock(150);
  for (let i = 0; i < after.childCount; i++)
    if (i !== changedSection)
      expect([i, after.child(i) === before.child(i)]).toEqual([i, true]);
  for (let j = 0; j < after.child(changedSection).childCount; j++)
    if (blockIndex(changedSection, j) !== 150)
      expect(
        after.child(changedSection).child(j) ===
          before.child(changedSection).child(j),
      ).toBe(true);
  expect(after.child(changedSection).child(50).textContent).toBe(
    "Rain line 150",
  );
});

test("a remote change is one transaction carrying y-sync's change meta, and the selection stays on its text", () => {
  const [a, b] = twoClients(script(300));
  const view = bound(b);
  setCaret(view, positionIn(view, idOf(200), 3));
  const dispatched: Transaction[] = [];
  spyDispatch(view, (tr) => dispatched.push(tr));
  scriptBody(a).write((w) =>
    w.insertBlocks(
      null,
      Array.from({ length: 30 }, (_, i) => line(1000 + i)),
    ),
  );
  flush();
  const { $head } = view.state.selection;
  expect([
    dispatched.length,
    dispatched[0]?.getMeta(ySyncPluginKey)?.isChangeOrigin,
    $head.parent.attrs.id,
    $head.parentOffset,
  ]).toEqual([1, true, idOf(200), 3]);
});

test("y-prosemirror replaces the whole document on a remote change", () => {
  const [a, b] = twoClients(script(300));
  const view = bound(b);
  const size = view.state.doc.content.size;
  const dispatched: Transaction[] = [];
  spyDispatch(view, (tr) => dispatched.push(tr));
  scriptBody(a).write((w) => w.insertText(idOf(150), 0, "Rain "));
  flush();
  const steps = dispatched.flatMap((tr) =>
    tr.steps.map((step) => {
      const json = step.toJSON();
      return [json.stepType, json.from, json.to];
    }),
  );
  expect(steps).toEqual([["replace", 0, size]]);
});
