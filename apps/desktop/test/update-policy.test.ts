import { expect, test } from "bun:test";
import { fakeClock } from "@manent/server-core/testing";
import {
  LAUNCH_UPDATE_WAIT_MS,
  PERIODIC_UPDATE_CHECK_MS,
  createPeriodicUpdateScheduler,
  mayApplyUpdate,
  nextUpdateState,
} from "../src/update-policy.ts";

test("an update is applied only at launch", () => {
  expect([
    LAUNCH_UPDATE_WAIT_MS,
    PERIODIC_UPDATE_CHECK_MS,
    ...(["launch", "running"] as const).map(mayApplyUpdate),
  ]).toEqual([1000, 6 * 60 * 60 * 1000, true, false]);
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

test("createPeriodicUpdateScheduler checks every 6 hours when allowed, skips when paused, and stops cleanly", () => {
  const time = fakeClock();
  let allowed = true;
  let checks = 0;
  const scheduler = createPeriodicUpdateScheduler({
    schedule: time.clock.schedule,
    canCheck: () => allowed,
    check: () => {
      checks += 1;
    },
  });

  scheduler.start();
  time.advance(PERIODIC_UPDATE_CHECK_MS - 1);
  expect(checks).toBe(0);

  time.advance(1);
  expect(checks).toBe(1);

  allowed = false;
  time.advance(PERIODIC_UPDATE_CHECK_MS);
  expect(checks).toBe(1);

  allowed = true;
  time.advance(PERIODIC_UPDATE_CHECK_MS);
  expect(checks).toBe(2);

  scheduler.stop();
  time.advance(PERIODIC_UPDATE_CHECK_MS * 2);
  expect(checks).toBe(2);
});
