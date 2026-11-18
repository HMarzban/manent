import { expect, test } from "bun:test";
import { LOCK_SOURCES as ENGINE_LOCK_SOURCES } from "@manent/pagination";
import type { LockAnchorRecord as EngineRecord } from "@manent/pagination";
import { LOCK_SOURCES as WIRE_LOCK_SOURCES } from "@manent/sync-protocol";
import type { LockAnchorRecord as WireRecord } from "@manent/sync-protocol";

test("the wire's lock anchor record is the engine's, field for field", () => {
  const wire: WireRecord = {
    level: 1,
    order: 1,
    label: "1",
    blockId: "a".repeat(16),
    offset: 0,
    quote: "",
    fallbackIds: [],
    source: "lock",
  };
  // each assignable to the other: a field added to one side stops the typecheck
  const engine: EngineRecord = wire;
  const back: WireRecord = engine;
  expect(Object.keys(back).toSorted()).toEqual([
    "blockId",
    "fallbackIds",
    "label",
    "level",
    "offset",
    "order",
    "quote",
    "source",
  ]);
  expect([...WIRE_LOCK_SOURCES]).toEqual([...ENGINE_LOCK_SOURCES]);
});
