import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  DEFAULT_BLOCK_ATTRS,
  normalizeDoc,
  parseDoc,
  sectionize,
  validateDoc,
} from "../src/index.ts";
import type { BlockJSON, DocJSON, MarkJSON } from "../src/index.ts";
import { ID, docArb, ids, runs } from "./helpers.ts";

test("normalising gives an empty document one section of one empty block", () => {
  expect(normalizeDoc({ type: "doc", content: [] }, ids)).toEqual({
    type: "doc",
    content: [
      {
        type: "section",
        content: [
          {
            type: "block",
            attrs: { ...DEFAULT_BLOCK_ATTRS, id: "f1f1f1f1f1f1f1f1" },
          },
        ],
      },
    ],
  });
});

test("normalising drops empty sections and removes unsafe links, keeping the text and its other marks", () => {
  const tel: MarkJSON = { type: "link", attrs: { href: "tel:+15551234" } };
  const web: MarkJSON = {
    type: "link",
    attrs: { href: "https://example.com" },
  };
  const doc: DocJSON = {
    type: "doc",
    content: [
      { type: "section", content: [] },
      {
        type: "section",
        content: [
          {
            type: "block",
            attrs: { id: ID },
            content: runs([
              { text: "call", marks: [{ type: "bold" }, tel] },
              { text: "site", marks: [web] },
            ]),
          },
        ],
      },
    ],
  };
  expect(normalizeDoc(doc, ids)).toEqual({
    type: "doc",
    content: [
      {
        type: "section",
        content: [
          {
            type: "block",
            attrs: { id: ID },
            content: runs([
              { text: "call", marks: [{ type: "bold" }] },
              { text: "site", marks: [web] },
            ]),
          },
        ],
      },
    ],
  });
});

test("normalising a normalised document changes nothing", () => {
  fc.assert(
    fc.property(docArb, (d) => {
      const n = normalizeDoc(d, ids);
      expect(normalizeDoc(n, ids)).toEqual(n);
    }),
  );
});

test("a normalised document can be read and leaves nothing to repair but duplicate IDs", () => {
  fc.assert(
    fc.property(docArb, (d) => {
      const n = normalizeDoc(d, ids);
      parseDoc(n);
      const repairs = validateDoc(n).filter(
        (issue) => issue.code !== "duplicate_id",
      );
      expect(repairs).toEqual([]);
    }),
  );
});

const blocks = (count: number): BlockJSON[] =>
  Array.from({ length: count }, (_, i) => ({
    type: "block",
    attrs: { id: `b${String(i).padStart(15, "0")}` },
  }));
const sizes = (json: DocJSON) =>
  (json.content ?? []).map((section) => section.content?.length);
test("sectionize makes even sections and never drops a block", () => {
  const all = blocks(250);
  const doc = sectionize(all);
  expect(sizes(doc)).toEqual([84, 83, 83]);
  expect(
    (doc.content ?? []).flatMap((section) => section.content ?? []),
  ).toEqual(all);
  expect(sectionize([])).toEqual({ type: "doc", content: [] });
  expect(sizes(sectionize(blocks(100)))).toEqual([100]);
  expect(sizes(sectionize(blocks(101)))).toEqual([51, 50]);
  expect(sizes(sectionize(blocks(5), 2))).toEqual([2, 2, 1]);
  expect(() => sectionize(all, 0)).toThrow(RangeError);
});
