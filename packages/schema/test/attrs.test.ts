import { expect, test } from "bun:test";
import {
  ALIGNMENTS,
  DEFAULT_BLOCK_ATTRS,
  DUALS,
  NODE_NAMES,
  fillBlockAttrs,
} from "../src/index.ts";
import type { BlockAttrs } from "../src/index.ts";

test("filling attributes promises nothing about their values", () => {
  expect(fillBlockAttrs({ id: 7, dual: "middle", glow: 3 })).toEqual({
    ...DEFAULT_BLOCK_ATTRS,
    id: 7,
    dual: "middle",
  });
  type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
  const honest: Same<
    ReturnType<typeof fillBlockAttrs>,
    Record<keyof BlockAttrs, unknown>
  > = true;
  expect(honest).toBe(true);
});

test("the values of dual and align are each one list", () => {
  expect([DUALS, ALIGNMENTS, NODE_NAMES]).toEqual([
    ["left", "right"],
    ["left", "center", "right"],
    ["doc", "section", "block", "text"],
  ]);
});

test("filling block attributes keeps given values as they are, fills missing keys and drops unknown ones", () => {
  const filled: unknown = fillBlockAttrs({
    type: "dialogue",
    omitted: "yes",
    glow: 3,
  });
  expect(filled).toEqual({
    ...DEFAULT_BLOCK_ATTRS,
    type: "dialogue",
    omitted: "yes",
  });
  expect(fillBlockAttrs()).toEqual(DEFAULT_BLOCK_ATTRS);
});
