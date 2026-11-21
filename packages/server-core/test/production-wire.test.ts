import { expect, test } from "bun:test";
import {
  BLOCK_CHANGES,
  COLOUR_ORDER_IDS,
  MARK_MODES,
  NUMBERING_SCHEMES,
} from "@manent/revisions";
import type {
  SceneNumberRecord as ModelSceneNumber,
  SetBlockRecord as ModelSetBlock,
} from "@manent/revisions";
import {
  BLOCK_CHANGES as WIRE_CHANGES,
  MARK_MODES as WIRE_MARK_MODES,
  NUMBERING_SCHEMES as WIRE_NUMBERING,
  COLOUR_ORDER_IDS as WIRE_ORDERS,
} from "@manent/sync-protocol";
import type {
  SceneNumberRecord as WireSceneNumber,
  SetBlockRecord as WireSetBlock,
} from "@manent/sync-protocol";

const SET_BLOCK: WireSetBlock = {
  blockId: "b5",
  pageLabel: "12A",
  change: "changed",
  hash: "0badf00d",
  inserted: [[3, 9]],
  deletedAt: [12],
};
const SCENE_NUMBER: WireSceneNumber = {
  blockId: "b1",
  num: "12A",
  reserved: false,
};

test("the wire's production records are the model's, field for field", () => {
  // each assignable to the other: a field added to one side stops the typecheck
  const wire: WireSetBlock = SET_BLOCK;
  const model: ModelSetBlock = wire;
  const back: WireSetBlock = model;
  const wireNumber: WireSceneNumber = SCENE_NUMBER;
  const modelNumber: ModelSceneNumber = wireNumber;
  const backNumber: WireSceneNumber = modelNumber;
  expect([
    Object.keys(back).toSorted(),
    Object.keys(backNumber).toSorted(),
    [...WIRE_MARK_MODES],
    [...WIRE_NUMBERING],
    [...WIRE_ORDERS],
    [...WIRE_CHANGES],
  ]).toEqual([
    ["blockId", "change", "deletedAt", "hash", "inserted", "pageLabel"],
    ["blockId", "num", "reserved"],
    [...MARK_MODES],
    [...NUMBERING_SCHEMES],
    [...COLOUR_ORDER_IDS],
    [...BLOCK_CHANGES],
  ]);
});
