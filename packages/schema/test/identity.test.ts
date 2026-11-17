import { expect, test } from "bun:test";
import {
  DEFAULT_BLOCK_ATTRS,
  attrsAfterJoin,
  attrsForNewBlock,
  attrsForSplitTail,
  findIdProblems,
  formatFrom,
  isBlockId,
  parseFrom,
  randomBlockId,
} from "../src/index.ts";
import type { BlockAttrs, DocJSON } from "../src/index.ts";

test("block IDs are 16 URL-safe characters and do not repeat", () => {
  const ids = new Set(Array.from({ length: 10_000 }, randomBlockId));
  expect(ids.size).toBe(10_000);
  for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{16}$/);
});

test("a block ID is 8 to 64 URL-safe characters", () => {
  expect(isBlockId(randomBlockId())).toBe(true);
  expect(isBlockId("a".repeat(8))).toBe(true);
  expect(isBlockId("a".repeat(64))).toBe(true);
  for (const value of [
    "a".repeat(7),
    "a".repeat(65),
    "with space1",
    "a:bcdefgh",
    12345678,
    null,
  ])
    expect(isBlockId(value)).toBe(false);
});

test("Enter at either end makes a block with a new ID and default attributes", () => {
  expect(attrsForNewBlock("dialogue", "n1n1n1n1n1n1n1n1")).toEqual({
    ...DEFAULT_BLOCK_ATTRS,
    id: "n1n1n1n1n1n1n1n1",
    type: "dialogue",
  });
});

test("a split tail copies overrides and timing exclusion, and nothing that identifies the scene", () => {
  const origin: BlockAttrs = {
    ...DEFAULT_BLOCK_ATTRS,
    id: "o1o1o1o1o1o1o1o1",
    type: "scene_heading",
    num: "12",
    omitted: true,
    dual: "left",
    synopsis: "Jane returns",
    align: "center",
    indent: 4,
    width: 30,
    spaceBefore: 2,
    noContd: true,
    noTiming: true,
    owner: "sam",
    suggest: "added",
    suggestId: "s1",
    suggestBy: "sam",
    suggestAt: 1,
  };
  expect(attrsForSplitTail(origin, "action", "t1t1t1t1t1t1t1t1", "k9")).toEqual(
    {
      ...DEFAULT_BLOCK_ATTRS,
      id: "t1t1t1t1t1t1t1t1",
      type: "action",
      align: "center",
      indent: 4,
      width: 30,
      spaceBefore: 2,
      noTiming: true,
      from: "o1o1o1o1o1o1o1o1:k9",
    },
  );
  expect(parseFrom("o1o1o1o1o1o1o1o1:k9")).toEqual({
    originId: "o1o1o1o1o1o1o1o1",
    nonce: "k9",
  });
  expect(parseFrom("no-colon")).toBeNull();
});

test("a split marker names its origin and nonce, or is not one", () => {
  expect(parseFrom(formatFrom("o2o2o2o2o2o2o2o2", "n:1"))).toEqual({
    originId: "o2o2o2o2o2o2o2o2",
    nonce: "n:1",
  });
  for (const value of [null, "", ":k9", "o2o2o2o2o2o2o2o2:"])
    expect(parseFrom(value)).toBeNull();
});

test("a join keeps the earlier block and reserves the later block's number", () => {
  const earlier = { ...DEFAULT_BLOCK_ATTRS, id: "e", type: "action" };
  const later = {
    ...DEFAULT_BLOCK_ATTRS,
    id: "l",
    type: "scene_heading",
    num: "13",
  };
  expect(attrsAfterJoin(earlier, later)).toEqual({
    attrs: earlier,
    reservedNum: "13",
  });
  expect(
    attrsAfterJoin(earlier, { ...later, num: null }).reservedNum,
  ).toBeNull();
});

const block = (id: string | null | undefined) =>
  ({ type: "block", attrs: id === undefined ? {} : { id } }) as const;

test("missing and duplicate IDs are found", () => {
  const doc: DocJSON = {
    type: "doc",
    content: [
      {
        type: "section",
        content: [
          block("dupdupdupdupdupd"),
          block(null),
          block("u1u1u1u1u1u1u1u1"),
        ],
      },
      {
        type: "section",
        content: [block("dupdupdupdupdupd"), block("dupdupdupdupdupd")],
      },
    ],
  };
  expect(findIdProblems(doc)).toEqual({
    missing: 1,
    duplicates: ["dupdupdupdupdupd"],
  });
  expect(
    findIdProblems({
      type: "doc",
      content: [{ type: "section", content: [block(undefined)] }],
    }),
  ).toEqual({
    missing: 1,
    duplicates: [],
  });
});
