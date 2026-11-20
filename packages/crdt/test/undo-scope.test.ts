import { expect, spyOn, test } from "bun:test";
import * as Y from "yjs";
import {
  ORIGIN_REMOTE,
  ORIGIN_REVIEW,
  createUndoScope,
  isUndoStep,
  observeScript,
  scriptBody,
  scriptDocFromJSON,
  undoManagerForBinding,
  yXmlFragmentForBinding,
} from "../src/index.ts";
import type { CrdtDoc } from "../src/index.ts";
import { FIRST_ID, ID, SAMPLE, docWith, textOf } from "./helpers.ts";

/** The first block of the first section, as stored. */
function firstBlock(doc: CrdtDoc): Y.XmlElement {
  const section = yXmlFragmentForBinding(doc).get(0);
  const block = section instanceof Y.XmlElement ? section.get(0) : null;
  if (!(block instanceof Y.XmlElement)) throw new RangeError("no block");
  return block;
}

function yDocOf(doc: CrdtDoc): Y.Doc {
  const ydoc = yXmlFragmentForBinding(doc).doc;
  if (ydoc === null) throw new RangeError("the fragment has no document");
  return ydoc;
}

test("the scope tracks the origins it is given and nothing else", () => {
  const doc = scriptDocFromJSON(SAMPLE);
  const scope = createUndoScope(doc, {
    trackedOrigins: ["typing", ORIGIN_REVIEW],
    roots: ["script"],
  });
  const manager = undoManagerForBinding(scope);
  scriptBody(doc).write((w) => w.insertText(FIRST_ID, 0, "a"), "typing");
  scriptBody(doc).write((w) => w.insertText(FIRST_ID, 0, "b"), ORIGIN_REMOTE);
  manager.stopCapturing();
  scriptBody(doc).write((w) => w.insertText(FIRST_ID, 0, "c"), ORIGIN_REVIEW);
  expect(manager.undoStack.length).toBe(2);
  manager.undo();
  manager.undo();
  expect(textOf(doc, FIRST_ID)).toBe("bEXT. SALT FLATS - DAWN");
});

test("a transaction marked addToHistory false is never an undo step", () => {
  const doc = scriptDocFromJSON(docWith({ id: ID, type: "action" }, "Rain"));
  const manager = undoManagerForBinding(
    createUndoScope(doc, { trackedOrigins: ["typing"], roots: ["script"] }),
  );
  const text = firstBlock(doc).get(0);
  yDocOf(doc).transact((tr) => {
    tr.meta.set("addToHistory", false);
    if (text instanceof Y.XmlText) text.insert(0, "Cold ");
  }, "typing");
  expect([textOf(doc, ID), manager.undoStack.length]).toEqual(["Cold Rain", 0]);
});

test("a scope over two roots undoes both in one step", () => {
  const doc = scriptDocFromJSON(docWith({ id: ID, type: "action" }, "Rain"));
  const manager = undoManagerForBinding(
    createUndoScope(doc, {
      trackedOrigins: ["typing"],
      roots: ["script", "revisedOverrides"],
    }),
  );
  const ydoc = yDocOf(doc);
  const overrides = ydoc.getMap("revisedOverrides");
  ydoc.transact(() => {
    scriptBody(doc).write((w) => w.insertText(ID, 0, "Cold "));
    overrides.set(`set1:${ID}`, "marked");
  }, "typing");
  manager.undo();
  expect([
    textOf(doc, ID),
    overrides.toJSON(),
    manager.undoStack.length,
  ]).toEqual(["Rain", {}, 0]);
});

test("undo keeps the words someone else typed into a text my step created", () => {
  const doc = scriptDocFromJSON(docWith({ id: ID, type: "action" }, ""));
  const manager = undoManagerForBinding(
    createUndoScope(doc, { trackedOrigins: ["typing"], roots: ["script"] }),
  );
  const ydoc = yDocOf(doc);
  const text = new Y.XmlText();
  ydoc.transact(() => {
    firstBlock(doc).insert(0, [text]);
    text.insert(0, "a");
  }, "typing");
  ydoc.transact(() => text.insert(1, "b"), ORIGIN_REMOTE);
  manager.undo();
  expect(textOf(doc, ID)).toBe("b");
});

test("a review action right after typing is an undo step of its own", () => {
  const doc = scriptDocFromJSON(SAMPLE);
  const manager = undoManagerForBinding(
    createUndoScope(doc, {
      trackedOrigins: ["typing", ORIGIN_REVIEW],
      roots: ["script"],
    }),
  );
  scriptBody(doc).write((w) => w.insertText(FIRST_ID, 0, "a"), "typing");
  scriptBody(doc).write((w) => w.insertText(FIRST_ID, 0, "R"), ORIGIN_REVIEW);
  scriptBody(doc).write((w) => w.insertText(FIRST_ID, 0, "b"), "typing");
  expect(manager.undoStack.length).toBe(3);
  manager.undo();
  manager.undo();
  expect(textOf(doc, FIRST_ID)).toBe("aEXT. SALT FLATS - DAWN");
});

test("an undo and a redo are told apart from every other change", () => {
  const doc = scriptDocFromJSON(SAMPLE);
  // the editor binding types under an object, its plugin key
  const typing = { key: "typing" };
  const manager = undoManagerForBinding(
    createUndoScope(doc, {
      trackedOrigins: [typing, ORIGIN_REVIEW],
      roots: ["script"],
    }),
  );
  const seen: boolean[] = [];
  const stop = observeScript(doc, (r) => seen.push(isUndoStep(r.origin)));
  scriptBody(doc).write((w) => w.insertText(FIRST_ID, 0, "a"), typing);
  scriptBody(doc).write((w) => w.insertText(FIRST_ID, 0, "b"), ORIGIN_REMOTE);
  scriptBody(doc).write((w) => w.insertText(FIRST_ID, 0, "R"), ORIGIN_REVIEW);
  manager.undo();
  manager.redo();
  stop();
  expect(seen).toEqual([false, false, false, true, true]);
});

test("a destroyed scope no longer listens to the document", () => {
  const doc = scriptDocFromJSON(SAMPLE);
  const manager = undoManagerForBinding(
    createUndoScope(doc, { trackedOrigins: ["typing"], roots: ["script"] }),
  );
  const stopCapturing = spyOn(manager, "stopCapturing");
  manager.destroy();
  scriptBody(doc).write((w) => w.insertText(FIRST_ID, 0, "R"), ORIGIN_REVIEW);
  expect(stopCapturing.mock.calls.length).toBe(0);
});
