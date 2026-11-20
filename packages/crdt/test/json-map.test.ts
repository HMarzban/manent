import { beforeEach, expect, test } from "bun:test";
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
    ["prefs", "keys", "flags", "continue", "review", "on_device"],
    ["projects", "documents"],
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
  ])
    expect(() => flags.set("x", value)).toThrow(TypeError);
  expect(flags.keys()).toEqual([]);
});
