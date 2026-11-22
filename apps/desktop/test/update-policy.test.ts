import { expect, test } from "bun:test";
import {
  LAUNCH_UPDATE_WAIT_MS,
  mayApplyUpdate,
  nextUpdateState,
} from "../src/update-policy.ts";

test("an update is applied only at launch", () => {
  expect([
    LAUNCH_UPDATE_WAIT_MS,
    ...(["launch", "running"] as const).map(mayApplyUpdate),
  ]).toEqual([1000, true, false]);
  expect([
    nextUpdateState(null, "check"),
    nextUpdateState("checking", "none"),
    nextUpdateState("checking", "downloaded"),
    nextUpdateState("checking", "failed"),
    nextUpdateState("ready", "check"),
  ]).toEqual(["checking", "up_to_date", "ready", "check_failed", "ready"]);
});

test("a check after an answer starts again, and a check while one runs starts nothing", () => {
  expect([
    nextUpdateState("up_to_date", "check"),
    nextUpdateState("check_failed", "check"),
    nextUpdateState("checking", "check"),
  ]).toEqual(["checking", "checking", "checking"]);
});
