import { expect, test } from "bun:test";
import * as pagination from "../src/index.ts";
import { ENGINE_VERSIONS, engineFor } from "../src/index.ts";

test("the engine a script is pinned to stays runnable, whole", () => {
  expect([
    ENGINE_VERSIONS,
    engineFor(1)!.version,
    engineFor(2)!.version,
    engineFor(3),
  ]).toEqual([[1, 2], 1, 2, null]);
  // pagination: the entry, imported whole
  expect(
    Object.entries(engineFor(1)!).filter(
      ([k, f]) => k !== "version" && f !== Reflect.get(pagination, k),
    ),
  ).toEqual([]);
});
