import { expect, test } from "bun:test";
import {
  createUndoScope,
  revisedOverrides,
  scriptDocFromJSON,
  undoManagerForBinding,
} from "../src/index.ts";
import type { UndoRoot } from "../src/index.ts";
import { SAMPLE } from "./helpers.ts";

const TYPING = "typing";
const KEY = "s1:b1";

/** What the override holds after it is marked and one undo runs over `roots`. */
function afterUndo(roots: readonly UndoRoot[]): string | null {
  const doc = scriptDocFromJSON(SAMPLE);
  const scope = createUndoScope(doc, { trackedOrigins: [TYPING], roots });
  revisedOverrides(doc).set(KEY, "marked", TYPING);
  undoManagerForBinding(scope).undo();
  return revisedOverrides(doc).get(KEY);
}

test("Mark revised is undone by one undo", () => {
  expect([
    afterUndo(["script", "revisedOverrides"]),
    afterUndo(["script"]),
  ]).toEqual([null, "marked"]);
});
