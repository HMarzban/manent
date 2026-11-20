import { beforeEach, expect, test } from "bun:test";
import fc from "fast-check";
import {
  blockText,
  blocksOf,
  canonicalBlock,
  fillBlockAttrs,
} from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { SCENE_HEADINGS, planRestore, sceneBlocks } from "../src/index.ts";
import type { RestoreOptions, RestoreScope } from "../src/index.ts";
import {
  A,
  B,
  C,
  D,
  H1,
  H2,
  H3,
  M,
  N,
  X,
  arbHistoryPair,
  b,
  blockJSONs,
  doc,
  scene,
} from "./history-docs.ts";

let count = 0;
beforeEach(() => {
  count = 0;
});
const OPTS: RestoreOptions = { newId: () => `n${++count}` };

function textOf(d: DocJSON, id: string): string {
  return blockText(blocksOf(d).find((x) => x.attrs.id === id)!);
}

const isHeading = (block: BlockJSON) =>
  SCENE_HEADINGS.some((type) => type === block.attrs?.type);

/** The scope's blocks of `d`, and the blocks outside it. */
function split(
  d: DocJSON,
  scope: RestoreScope,
): { inside: BlockJSON[]; outside: BlockJSON[] } {
  const blocks = blockJSONs(d);
  if (scope.kind === "script") return { inside: blocks, outside: [] };
  const ids = sceneBlocks(d, scope.headingId);
  const start = blocks.findIndex((x) => x.attrs!.id === scope.headingId);
  if (ids.length === 0) return { inside: [], outside: blocks };
  return {
    inside: blocks.slice(start, start + ids.length),
    outside: [...blocks.slice(0, start), ...blocks.slice(start + ids.length)],
  };
}

function withoutId(block: BlockJSON): BlockJSON {
  return canonicalBlock({ ...block, attrs: { ...block.attrs, id: null } });
}

/** The scope's blocks, without their ids where newId gave one. */
function scoped(d: DocJSON, scope: RestoreScope): BlockJSON[] {
  return split(d, scope).inside.map((x) =>
    /^n\d+$/.test(String(x.attrs!.id)) ? withoutId(x) : x,
  );
}

function outsideScope(d: DocJSON, scope: RestoreScope): BlockJSON[] {
  return split(d, scope).outside;
}

function withoutIds(d: DocJSON): BlockJSON[] {
  return blockJSONs(d).map(withoutId);
}

/**
 * The target as a restore of `scope` over `current` should leave it: each
 * block with the number and omission current gives its id (none and false
 * where current lacks it), and, in a scene, under the stand-in id n0 where current
 * holds that id outside the scene.
 */
function withAuthority(
  target: DocJSON,
  current: DocJSON,
  scope: RestoreScope,
): DocJSON {
  const held = new Map(blockJSONs(current).map((x) => [x.attrs!.id, x]));
  const outside = new Set(outsideScope(current, scope).map((x) => x.attrs!.id));
  const inside = new Set(
    scope.kind === "scene" ? sceneBlocks(target, scope.headingId) : [],
  );
  return doc(
    ...blockJSONs(target).map((x) => {
      const now = held.get(x.attrs!.id);
      const filled = fillBlockAttrs(now?.attrs);
      const attrs: Record<string, unknown> = {
        ...x.attrs,
        num: now === undefined ? null : filled.num,
        omitted: now === undefined ? false : filled.omitted,
      };
      const block = canonicalBlock({ ...x, attrs });
      return inside.has(String(x.attrs!.id)) && outside.has(x.attrs!.id)
        ? canonicalBlock({ ...block, attrs: { ...block.attrs, id: "n0" } })
        : block;
    }),
  );
}

/** A whole-script restore, or one of the target's scenes. */
const arbScopeOf: fc.Arbitrary<(d: DocJSON) => RestoreScope> = fc.oneof(
  fc.constant(() => ({ kind: "script" as const })),
  fc.nat().map((k) => (d: DocJSON): RestoreScope => {
    const headings = blockJSONs(d).filter(isHeading);
    return headings.length === 0
      ? { kind: "script" }
      : {
          kind: "scene",
          headingId: String(headings[k % headings.length]!.attrs!.id),
        };
  }),
);

test("a whole-script restore deletes, re-creates, reorders and minimally replaces", () => {
  const current = doc(b(A, "one"), b(C, "three"), b(B, "TWO"), b(N, "new"));
  const target = doc(b(A, "one"), b(B, "two"), b(C, "three"), b(D, "four"));
  const plan = planRestore(current, target, { kind: "script" }, OPTS);
  expect(plan.ops).toEqual([
    { op: "delete", id: N },
    { op: "delete", id: C },
    { op: "insert", after: B, block: b(C, "three") },
    { op: "insert", after: C, block: b(D, "four") },
    { op: "replace", block: b(B, "two") },
  ]);
  expect(blocksOf(plan.result).map((x) => [x.attrs.id, blockText(x)])).toEqual([
    [A, "one"],
    [B, "two"],
    [C, "three"],
    [D, "four"],
  ]);
  expect(plan.applied).toBe(4);
});

test("restoring one scene touches only that scene's blocks", () => {
  const current = doc(
    ...scene(H1, b(A, "a!")),
    ...scene(H2, b(B, "b!"), b(X, "x")),
  );
  const target = doc(...scene(H1, b(A, "a")), ...scene(H2, b(B, "b")));
  const plan = planRestore(
    current,
    target,
    { kind: "scene", headingId: H2 },
    OPTS,
  );
  expect(plan.ops).toEqual([
    { op: "delete", id: X },
    { op: "replace", block: b(B, "b") },
  ]);
  expect(textOf(plan.result, A)).toBe("a!");
});

test("a scene deleted since is re-created where it was", () => {
  const current = doc(...scene(H1, b(A, "a")), ...scene(H3, b(C, "c")));
  const target = doc(
    ...scene(H1, b(A, "a")),
    ...scene(H2, b(B, "b")),
    ...scene(H3, b(C, "c")),
  );
  const plan = planRestore(
    current,
    target,
    { kind: "scene", headingId: H2 },
    OPTS,
  );
  expect(plan.ops).toEqual([
    {
      op: "insert",
      after: A,
      block: b(H2, "INT. HALL - DAY", { type: "scene_heading" }),
    },
    { op: "insert", after: H2, block: b(B, "b") },
  ]);
  expect(blocksOf(plan.result).map((x) => x.attrs.id)).toEqual([
    H1,
    A,
    H2,
    B,
    H3,
    C,
  ]);
});

test("restore never changes scene numbers or omitted scenes", () => {
  const current = doc(
    b(H1, "INT. KITCHEN", { type: "scene_heading", num: "12", omitted: true }),
  );
  const target = doc(
    b(H1, "INT. KITCHEN - NIGHT", { type: "scene_heading", num: null }),
    b(H3, "EXT. PIER", { type: "scene_heading", num: "14" }),
  );
  const blocks = blocksOf(
    planRestore(current, target, { kind: "script" }, OPTS).result,
  );
  expect(
    blocks.map((x) => [x.attrs.id, x.attrs.num, x.attrs.omitted, blockText(x)]),
  ).toEqual([
    [H1, "12", true, "INT. KITCHEN - NIGHT"],
    [H3, null, false, "EXT. PIER"],
  ]);
});

test("a scene restore copies, under a new id, a block the script now holds in another scene", () => {
  const current = doc(
    ...scene(H1, b(A, "a"), b(M, "moved")),
    ...scene(H2, b(B, "b")),
  );
  const target = doc(
    ...scene(H1, b(A, "a")),
    ...scene(H2, b(B, "b"), b(M, "moved")),
  );
  const plan = planRestore(
    current,
    target,
    { kind: "scene", headingId: H2 },
    OPTS,
  );
  expect(plan.ops).toEqual([
    { op: "insert", after: B, block: b("n1", "moved") },
  ]);
  // blocksOf refuses "n1", which is not a valid block id, so the ids are read from the JSON
  expect(blockJSONs(plan.result).map((x) => x.attrs!.id)).toEqual([
    H1,
    A,
    M,
    H2,
    B,
    "n1",
  ]);
});

test("restoring the version that is already current plans nothing", () => {
  const current = doc(...scene(H1, b(A, "a")), ...scene(H2, b(B, "b")));
  expect(planRestore(current, current, { kind: "script" }, OPTS)).toEqual({
    ops: [],
    applied: 0,
    result: current,
  });
  expect(
    planRestore(current, current, { kind: "scene", headingId: H2 }, OPTS).ops,
  ).toEqual([]);
});

test("the restored scope equals the target, whatever the two documents", () => {
  fc.assert(
    fc.property(arbHistoryPair, arbScopeOf, ({ older, newer }, pick) => {
      count = 0;
      const scope = pick(older);
      const plan = planRestore(newer, older, scope, OPTS);
      expect(scoped(plan.result, scope)).toEqual(
        scoped(withAuthority(older, newer, scope), scope),
      );
      expect(outsideScope(plan.result, scope)).toEqual(
        outsideScope(newer, scope),
      );
      const again = planRestore(plan.result, older, scope, OPTS);
      expect(
        scope.kind === "script" ? again.ops : withoutIds(again.result),
      ).toEqual(scope.kind === "script" ? [] : withoutIds(plan.result));
      const ids = blockJSONs(plan.result).map((x) => x.attrs!.id);
      expect(new Set(ids).size).toBe(ids.length);
    }),
    { numRuns: 1_000 },
  );
});
