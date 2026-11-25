import { expect, test } from "bun:test";
import { schema } from "@manent/schema";
import { EditorState } from "prosemirror-state";
import { suggestPlugin } from "../src/index.ts";
import { docOf } from "./docs.ts";

test("replacing one emoji with another while suggesting keeps each emoji whole", () => {
  let next = 0;
  const plugin = suggestPlugin({
    userId: "u1",
    now: () => 1000,
    ids: () => `s${next++}`,
    isSuggesting: () => true,
    isLocked: () => false,
    isFromBinding: () => false,
    bar: { label: "Suggestion", onActivate: () => {} },
  });
  const state = EditorState.create({
    doc: docOf([["a\u{1F603}b"]]),
    plugins: [plugin],
  });
  const { state: after } = state.applyTransaction(
    state.tr.replaceWith(3, 5, schema.text("\u{1F600}")),
  );
  const runs: [string, string[]][] = [];
  after.doc.firstChild!.firstChild!.forEach((text) =>
    runs.push([text.text ?? "", text.marks.map((mark) => mark.type.name)]),
  );
  expect(runs).toEqual([
    ["a", []],
    ["\u{1F603}", ["suggest_delete"]],
    ["\u{1F600}", ["suggest_insert"]],
    ["b", []],
  ]);
});
