import { expect, test } from "bun:test";
import {
  ACT_BREAK_KINDS,
  BLOCK_TYPES,
  DEFAULT_BLOCK_ATTRS,
  parseDoc,
} from "../src/index.ts";
import type { DocJSON } from "../src/index.ts";
import { ALL_MARKS, docWith } from "./helpers.ts";

/** The same doc with every block attribute filled. */
function withDefaults(json: DocJSON): DocJSON {
  return {
    ...json,
    content: json.content?.map((section) => ({
      ...section,
      content: section.content?.map((block) => ({
        ...block,
        attrs: { ...DEFAULT_BLOCK_ATTRS, ...block.attrs },
      })),
    })),
  };
}

test("every element of every format round-trips through JSON", () => {
  for (const type of BLOCK_TYPES)
    for (const kind of type === "act_break" ? ACT_BREAK_KINDS : [null]) {
      const json = docWith({ id: "b000000000000001", type, kind }, ALL_MARKS);
      expect(parseDoc(json).toJSON()).toEqual(withDefaults(json));
    }
});

test("a mark or attribute from a newer build does not stop this one reading the script", () => {
  const json = docWith({ id: "b000000000000003", type: "action", glow: 3 }, [
    {
      text: "Rain",
      marks: [{ type: "blink", attrs: { rate: 2 } }, { type: "bold" }],
    },
  ]);
  const doc = parseDoc(json); // no throw
  expect(doc.textContent).toBe("Rain");
  expect(
    doc.firstChild!.firstChild!.firstChild!.marks.map((m) => m.type.name),
  ).toEqual(["bold"]);
});

test("bad structure throws a RangeError", () => {
  expect(() => parseDoc({ type: "doc", content: [] })).toThrow(RangeError);
  expect(() =>
    parseDoc({
      type: "doc",
      content: [{ type: "section", content: [{ type: "page" }] }],
    } as unknown as DocJSON),
  ).toThrow(RangeError);
});
