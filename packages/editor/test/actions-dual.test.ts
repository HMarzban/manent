import { expect, test } from "bun:test";
import { schema } from "@manent/schema";
import type { Node } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import { toggleDualDialogue } from "../src/index.ts";
import { bid, docOfBlocks, stateAt } from "./docs.ts";

/** The state after `step`, which may dispatch any number of transactions. */
function act(
  start: EditorState,
  step: (state: EditorState, dispatch: (tr: Transaction) => void) => unknown,
): EditorState {
  let next = start;
  step(start, (tr) => {
    next = next.apply(tr);
  });
  return next;
}

/** One section whose block k has the element types[k] and the text texts[k]. */
const docOfTypes = (types: readonly string[], texts: readonly string[]): Node =>
  docOfBlocks(types.map((type, k) => [type, texts[k]!]));

/** A section per list of elements; the texts run on across sections, and block k has the id bid(k). */
function docOfSections(
  sections: readonly (readonly string[])[],
  texts: readonly string[],
): Node {
  let next = 0;
  return schema.node(
    "doc",
    null,
    sections.map((types) =>
      schema.node(
        "section",
        null,
        types.map((type) => {
          const text = texts[next]!;
          return schema.node(
            "block",
            { id: bid(next++), type },
            text === "" ? [] : schema.text(text),
          );
        }),
      ),
    ),
  );
}

/** Every block's attribute `name`, in document order. */
function attr(s: EditorState, name: string): unknown[] {
  const values: unknown[] = [];
  s.doc.forEach((section) =>
    section.forEach((block) => values.push(block.attrs[name])),
  );
  return values;
}

const sectionSizes = (doc: Node): number[] => {
  const sizes: number[] = [];
  doc.forEach((section) => sizes.push(section.childCount));
  return sizes;
};

const speeches = docOfTypes(
  ["character", "dialogue", "character", "parenthetical", "dialogue", "action"],
  ["DANA", "Go.", "SAM", "(quiet)", "No.", "They wait."],
);

test("dual dialogue pairs the caret's speech with the one before it", () => {
  const out = act(stateAt(speeches, 4, 1), toggleDualDialogue);
  expect(attr(out, "dual")).toEqual([
    "left",
    "left",
    "right",
    "right",
    "right",
    null,
  ]);
  expect(attr(act(stateAt(out.doc, 1, 0), toggleDualDialogue), "dual")).toEqual(
    [null, null, null, null, null, null],
  );
});

test("dual dialogue pairs the caret's speech with the one after it when none comes before", () => {
  const out = act(stateAt(speeches, 0, 2), toggleDualDialogue);
  expect(attr(out, "dual")).toEqual([
    "left",
    "left",
    "right",
    "right",
    "right",
    null,
  ]);
});

test("dual dialogue pairs speeches across a section boundary, and no block changes section", () => {
  const split = docOfSections(
    [
      ["action", "character", "dialogue"],
      ["character", "dialogue", "action"],
    ],
    ["x", "DANA", "Go.", "SAM", "No.", "y"],
  );
  const out = act(stateAt(split, 3, 0), toggleDualDialogue);
  expect([attr(out, "dual"), sectionSizes(out.doc)]).toEqual([
    [null, "left", "left", "right", "right", null],
    [3, 3],
  ]);
});

test("a lone speech cannot be dual", () => {
  expect(
    toggleDualDialogue(
      stateAt(
        docOfTypes(
          ["action", "character", "dialogue", "action"],
          ["x", "DANA", "Go.", "y"],
        ),
        2,
        0,
      ),
    ),
  ).toEqual({ ok: false, reason: "needs_two_speeches" });
});

test("a speech already in a pair is not taken for another", () => {
  const three = docOfTypes(
    ["character", "dialogue", "character", "dialogue", "character", "dialogue"],
    ["DANA", "Go.", "SAM", "No.", "PRIYA", "Wait."],
  );
  const paired = act(stateAt(three, 2, 0), toggleDualDialogue);
  expect([
    toggleDualDialogue(stateAt(paired.doc, 5, 0)),
    attr(paired, "dual"),
  ]).toEqual([
    { ok: false, reason: "needs_two_speeches" },
    ["left", "left", "right", "right", null, null],
  ]);
});
