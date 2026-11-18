import { expect, test } from "bun:test";
import { canonicalBlock, sectionize } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import {
  ORIGIN_REPLAY,
  applyBlockOps,
  scriptBody,
  scriptDocFromJSON,
} from "../src/index.ts";
import {
  ID_A,
  ID_B,
  ID_C,
  block,
  bodyBlockIds,
  deletedCharacters,
  idOf,
  textOf,
} from "./helpers.ts";

/** A block of three runs, bold, italic and a link, in Arabic and English. */
function marked(id: string): BlockJSON {
  return {
    type: "block",
    attrs: { id, type: "dialogue" },
    content: [
      { type: "text", text: "مرحبا ", marks: [{ type: "bold" }] },
      { type: "text", text: "بالعالم", marks: [{ type: "italic" }] },
      {
        type: "text",
        text: " at home",
        marks: [{ type: "link", attrs: { href: "https://example.com" } }],
      },
    ],
  };
}

test("an operation keeps a block's text and every mark exactly", () => {
  const target = scriptDocFromJSON(
    sectionize([
      {
        type: "block",
        attrs: { id: ID_A, type: "scene_heading", num: "4", glow: 1 },
        content: [
          { type: "text", text: "INT. HALL", marks: [{ type: "bold" }] },
        ],
      },
    ]),
    { clientId: 2 },
  );
  expect(
    applyBlockOps(
      target,
      [
        { op: "replace", block: marked(ID_A) },
        { op: "insert", after: ID_A, block: marked(ID_B) },
      ],
      ORIGIN_REPLAY,
    ),
  ).toBe(2);
  expect(scriptBody(target).materialize()).toEqual({
    type: "doc",
    content: [
      {
        type: "section",
        content: [canonicalBlock(marked(ID_A)), canonicalBlock(marked(ID_B))],
      },
    ],
  });
});

test("a replace writes only what changed", () => {
  const target = scriptDocFromJSON(
    sectionize([block(ID_A, "The rain falls")]),
    {
      clientId: 2,
    },
  );
  const seen: Uint8Array[] = [];
  target.subscribe((u) => seen.push(u));
  expect(
    applyBlockOps(
      target,
      [{ op: "replace", block: block(ID_A, "The cold rain falls") }],
      ORIGIN_REPLAY,
    ),
  ).toBe(1);
  expect(textOf(target, ID_A)).toBe("The cold rain falls");
  expect(deletedCharacters(seen)).toBe(0); // an insert of "cold ", nothing deleted
});

test("each operation is one write under the origin given", () => {
  const target = scriptDocFromJSON(
    sectionize([block(ID_A, "one"), block(ID_B, "two")]),
  );
  const origins: unknown[] = [];
  target.subscribe((_update, origin) => origins.push(origin));
  applyBlockOps(
    target,
    [
      { op: "replace", block: marked(ID_A) },
      { op: "delete", id: ID_B },
      { op: "insert", after: null, block: block(ID_C, "three") },
    ],
    ORIGIN_REPLAY,
  );
  expect(origins).toEqual([ORIGIN_REPLAY, ORIGIN_REPLAY, ORIGIN_REPLAY]);
});

test("an operation on a block that is gone writes nothing and is not counted", () => {
  const target = scriptDocFromJSON(sectionize([block(ID_A, "here")]));
  const seen: Uint8Array[] = [];
  target.subscribe((u) => seen.push(u));
  expect(
    applyBlockOps(
      target,
      [
        { op: "replace", block: block(ID_B, "gone") },
        { op: "delete", id: ID_B },
        { op: "insert", after: ID_B, block: block(ID_C, "after gone") },
      ],
      ORIGIN_REPLAY,
    ),
  ).toBe(0);
  expect([seen.length, bodyBlockIds(target)]).toEqual([0, [ID_A]]);
});

test("inserts land after their anchor, or at the very start", () => {
  const target = scriptDocFromJSON(
    sectionize([block(ID_A, "a"), block(ID_B, "b")]),
  );
  expect(
    applyBlockOps(
      target,
      [
        { op: "insert", after: ID_A, block: block(ID_C, "c") },
        { op: "insert", after: null, block: block(idOf(1), "first") },
      ],
      ORIGIN_REPLAY,
    ),
  ).toBe(2);
  expect(bodyBlockIds(target)).toEqual([idOf(1), ID_A, ID_C, ID_B]);
});
