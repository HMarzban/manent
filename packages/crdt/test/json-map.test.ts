import { beforeEach, expect, test } from "bun:test";
import fc from "fast-check";
import {
  ORIGIN_REMOTE,
  PRIVATE_INDEX_MAPS,
  WORKSPACE_INDEX_MAPS,
  createDoc,
  jsonMap,
  loadDoc,
} from "../src/index.ts";
import type { CrdtDoc } from "../src/index.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";

// two replicas of one empty document, made again for every test
let a: CrdtDoc;
let b: CrdtDoc;
beforeEach(() => {
  const state = createDoc().encodeState();
  a = loadDoc(state, { clientId: 1 });
  b = loadDoc(state, { clientId: 2 });
});

test("a map of an index document carries JSON values to another replica", () => {
  jsonMap(a, "continue").set(DOC, { workspaceId: "medium", openedAt: 5 });
  b.applyUpdate(a.diff(b.encodeStateVector()));
  expect(jsonMap(b, "continue").entries()).toEqual({
    [DOC]: { workspaceId: "medium", openedAt: 5 },
  });
  expect(jsonMap(b, "continue").get("nope")).toBeNull();
  expect(() => jsonMap(a, "flags").set("x", undefined)).toThrow(TypeError);
});

test("a listener hears local and remote changes as such", () => {
  const seen: unknown[] = [];
  jsonMap(b, "flags").subscribe((keys, origin) => seen.push([keys, origin]));
  jsonMap(b, "flags").set("tour_seen", true);
  jsonMap(a, "flags").set("other", true);
  b.applyUpdate(a.diff(b.encodeStateVector()), ORIGIN_REMOTE);
  expect(seen).toEqual([
    [["tour_seen"], "local"],
    [["other"], "remote"],
  ]);
});

test("the map names of the two index kinds are fixed", () => {
  expect([PRIVATE_INDEX_MAPS, WORKSPACE_INDEX_MAPS]).toEqual([
    [
      "prefs",
      "keys",
      "flags",
      "continue",
      "review",
      "on_device",
      "tour",
      "writing",
      "private_copies",
      "last_read",
      "rundown_columns",
      "favourites",
      "private_folder",
      "goals",
    ],
    ["projects", "documents", "folders"],
  ]);
});

test("a value that is not JSON is refused, and nothing is written", () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  const flags = jsonMap(a, "flags");
  for (const value of [
    Number.NaN,
    Infinity,
    () => true,
    new Date(0),
    [1, undefined],
    { at: 1n },
    cycle,
    JSON.parse('{"__proto__": 0}'),
  ])
    expect(() => flags.set("x", value)).toThrow(TypeError);
  expect(flags.keys()).toEqual([]);
});

test("a string with a lone surrogate is refused, as value, object key or map key", () => {
  const flags = jsonMap(a, "flags");
  for (const [key, value] of [
    ["x", "A\uD800B"],
    ["x", "\uDC00"],
    ["x", "\uDBFF\uDFFF\uDC00"],
    ["x", { title: "A\uDBFF" }],
    ["x", ["\uDFFFB"]],
    ["x", { "\uD800": 1 }],
    ["\uD800", 1],
  ] as const)
    expect(() => flags.set(key, value)).toThrow(TypeError);
  expect(flags.keys()).toEqual([]);
});

// any code point, or now and then half of a surrogate pair on its own
const UNIT = fc.oneof(
  {
    weight: 29,
    arbitrary: fc.string({ unit: "binary", minLength: 1, maxLength: 1 }),
  },
  {
    weight: 1,
    arbitrary: fc
      .integer({ min: 0xd800, max: 0xdfff })
      .map((unit) => String.fromCharCode(unit)),
  },
);

test("a value the map accepts reads back the same on another replica", () => {
  fc.assert(
    fc.property(
      fc.string({ unit: UNIT }),
      fc.jsonValue({ stringUnit: UNIT }),
      (key, value) => {
        const left = loadDoc(createDoc().encodeState());
        const right = loadDoc(left.encodeState());
        try {
          jsonMap(left, "documents").set(key, value);
        } catch (refused) {
          if (!(refused instanceof TypeError)) throw refused;
          return;
        }
        right.applyUpdate(left.diff(right.encodeStateVector()));
        expect(jsonMap(right, "documents").entries()).toEqual(
          jsonMap(left, "documents").entries(),
        );
        expect(jsonMap(right, "documents").get(key)).toEqual(value);
      },
    ),
    { numRuns: 300 },
  );
});
