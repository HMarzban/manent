import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import {
  ORIGIN_REVIEW,
  createUndoScope,
  scriptBody,
  scriptDocFromJSON,
  undoManagerForBinding,
  yXmlFragmentForBinding,
} from "@manent/crdt";
import type { HistoryPort } from "@manent/editor";
import { schema } from "@manent/schema";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  initProseMirrorDoc,
  ySyncPlugin,
  ySyncPluginKey,
  yUndoPluginKey,
} from "y-prosemirror";
import { createHistory } from "../src/index.ts";
import {
  ID,
  SAMPLE,
  bindingOf,
  blocksOfView,
  bound,
  docWith,
  flush,
  idOf,
  positionIn,
  twoClients,
  typeInto,
} from "./helpers.ts";

withDom();

const history = (view: EditorView): HistoryPort => bindingOf(view).history;

function textOf(view: EditorView, id: string): string {
  return blocksOfView(view).find((block) => block.id === id)?.text ?? "";
}

const endOf = (view: EditorView, id: string): number =>
  positionIn(view, id, textOf(view, id).length);

test("y-prosemirror's undo plugin uses the manager it is given, and destroys it with the view", () => {
  const doc = scriptDocFromJSON(docWith({ id: ID, type: "action" }, "Rain"));
  const scope = createUndoScope(doc, {
    trackedOrigins: [ySyncPluginKey],
    roots: ["script"],
  });
  const fragment = yXmlFragmentForBinding(doc);
  const { doc: start, mapping } = initProseMirrorDoc(fragment, schema);
  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: start,
      plugins: [
        ySyncPlugin(fragment, { mapping }),
        createHistory({ scope }).plugin,
      ],
    }),
  });
  const used =
    yUndoPluginKey.getState(view.state)?.undoManager ===
    undoManagerForBinding(scope);
  view.destroy();
  scriptBody(doc).write((w) => w.insertText(ID, 0, "Cold "), ySyncPluginKey);
  expect([used, undoManagerForBinding(scope).undoStack.length]).toEqual([
    true,
    0,
  ]);
});

test("undo takes back only my own words around someone else's", () => {
  const [a, b] = twoClients(docWith({ id: ID, type: "action" }, "Rain"));
  const view = bound(b);
  typeInto(view, endOf(view, ID), " falls");
  scriptBody(a).write((w) => w.insertText(ID, 0, "Cold "));
  flush();
  expect(textOf(view, ID)).toBe("Cold Rain falls");
  expect(history(view).undo(view.state, view.dispatch)).toBe(true);
  flush();
  expect([textOf(view, ID), scriptBody(a).materialize()]).toEqual([
    "Cold Rain",
    scriptBody(b).materialize(),
  ]);
});

test("an undo whose text someone else deleted is skipped", () => {
  const [a, b] = twoClients(SAMPLE);
  const view = bound(b);
  typeInto(view, positionIn(view, idOf(1)), "Far off, ");
  flush();
  scriptBody(a).write((w) => w.deleteBlock(idOf(1)));
  flush();
  const asALeftIt = scriptBody(a).materialize();
  history(view).undo(view.state, view.dispatch);
  flush();
  expect([scriptBody(b).materialize(), scriptBody(a).materialize()]).toEqual([
    asALeftIt,
    asALeftIt,
  ]);
});

test("undo restores the ids that existed", () => {
  const view = bound(scriptDocFromJSON(SAMPLE));
  const before = blocksOfView(view);
  const end = positionIn(view, idOf(1), before[1]!.text.length);
  view.dispatch(view.state.tr.delete(end, positionIn(view, idOf(2))));
  const joined = blocksOfView(view).map((block) => block.id);
  history(view).undo(view.state, view.dispatch);
  expect([joined, blocksOfView(view)]).toEqual([
    [idOf(0), idOf(1), idOf(3), idOf(4), idOf(5)],
    before,
  ]);
});

test("a change made through closeStep is its own undo step", () => {
  const view = bound(
    scriptDocFromJSON(docWith({ id: ID, type: "action" }, "")),
  );
  typeInto(view, positionIn(view, ID), "int. ");
  history(view).closeStep(view.state);
  view.dispatch(
    view.state.tr.setNodeAttribute(
      positionIn(view, ID) - 1,
      "type",
      "scene_heading",
    ),
  );
  history(view).closeStep(view.state);
  history(view).undo(view.state, view.dispatch);
  const block = view.state.doc.firstChild?.firstChild;
  expect([block?.attrs.type, block?.textContent]).toEqual(["action", "int. "]);
});

test("remote changes are never on my undo stack", () => {
  const [a, b] = twoClients(SAMPLE);
  const view = bound(b);
  let steps = 0;
  history(view).onStep(() => steps++);
  scriptBody(a).write((w) => w.insertText(idOf(1), 0, "Far off, "));
  flush();
  expect([
    textOf(view, idOf(1)).startsWith("Far off, "),
    history(view).canUndo(view.state),
    steps,
  ]).toEqual([true, false, 0]);
});

test("a new step of mine is announced to the listeners", () => {
  const view = bound(scriptDocFromJSON(SAMPLE));
  let steps = 0;
  const stop = history(view).onStep(() => steps++);
  typeInto(view, positionIn(view, idOf(1)), "x");
  const afterX = steps;
  history(view).closeStep(view.state);
  typeInto(view, positionIn(view, idOf(1)), "y");
  const afterY = steps;
  stop();
  history(view).closeStep(view.state);
  typeInto(view, positionIn(view, idOf(1)), "z");
  expect([afterX, afterY, steps]).toEqual([1, 2, 2]);
});

test("a review action is one undo step of mine", () => {
  const doc = scriptDocFromJSON(docWith({ id: ID, type: "action" }, "Rain"));
  const view = bound(doc);
  scriptBody(doc).write((w) => {
    w.deleteText(ID, 0, 4);
    w.insertText(ID, 0, "Snow");
  }, ORIGIN_REVIEW);
  const replaced = textOf(view, ID);
  history(view).undo(view.state, view.dispatch);
  expect([
    replaced,
    textOf(view, ID),
    history(view).canUndo(view.state),
  ]).toEqual(["Snow", "Rain", false]);
});
