import { expect, test } from "bun:test";
import type { VersionKind, VersionRow } from "@manent/storage";
import { thinVersions } from "../src/index.ts";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** Midnight UTC, 1 June 2027. */
const MIDNIGHT = 1_811_808_000_000;
/** Half past noon that day: off every hour and day boundary. */
const NOW = MIDNIGHT + 12 * HOUR_MS + 30 * 60_000;

/** The instant `dayOffset` days from today's midnight, at hour:minute UTC. */
const at = (dayOffset: number, hour: number, minute: number): number =>
  MIDNIGHT + dayOffset * DAY_MS + hour * HOUR_MS + minute * 60_000;

const row = (id: string, kind: VersionKind, createdAt: number): VersionRow => ({
  id,
  docId: "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd",
  generation: 1,
  seq: 1,
  kind,
  name: null,
  createdByUserId: "sam",
  createdAt,
  deviceId: null,
});

const auto = (id: string, createdAt: number): VersionRow =>
  row(id, "auto", createdAt);

test("every automatic version of the last day is kept", () => {
  const rows = [
    auto("a", NOW - 1),
    auto("b", NOW - 2),
    auto("c", NOW - DAY_MS + 1),
    row("d", "saved", NOW - 3),
  ];
  expect(thinVersions(rows, NOW)).toEqual({
    keep: ["a", "b", "c", "d"],
    remove: [],
    mergeInto: new Map(),
  });
});

test("between a day and thirty days, the newest of each hour is kept", () => {
  const rows = [
    auto("a", at(-2, 10, 5)),
    auto("b", at(-2, 10, 50)),
    auto("c", at(-2, 11, 1)),
  ]; // at(dayOffset, hour, minute), UTC
  expect(thinVersions(rows, NOW)).toEqual({
    keep: ["b", "c"],
    remove: ["a"],
    mergeInto: new Map([["a", "b"]]),
  });
});

test("after thirty days, the newest of each day is kept", () => {
  const rows = [
    auto("a", at(-40, 1, 0)),
    row("b", "export", at(-40, 23, 59)),
    auto("c", at(-41, 12, 0)),
    row("d", "pre_restore", at(-40, 9, 30)),
  ];
  expect(thinVersions(rows, NOW)).toEqual({
    keep: ["b", "c"],
    remove: ["a", "d"],
    mergeInto: new Map([
      ["a", "b"],
      ["d", "b"],
    ]),
  });
});

test("named, sent, issued, baseline and recovered versions are kept forever", () => {
  const kinds: VersionKind[] = [
    "named",
    "sent",
    "revision_issue",
    "revision_baseline",
    "recovered",
  ];
  // each kind at age 400 days, two in one hour
  const rows = kinds.flatMap((kind) => [
    row(`${kind}-1`, kind, at(-400, 10, 5)),
    row(`${kind}-2`, kind, at(-400, 10, 6)),
  ]);
  expect(thinVersions(rows, NOW)).toEqual({
    keep: rows.map((r) => r.id),
    remove: [],
    mergeInto: new Map(),
  });
});

test("the boundary of a day and of thirty days belongs to the younger rule", () => {
  // age exactly 86_400_000 → hourly; exactly 2_592_000_000 → daily
  const hourly = [
    auto("a", NOW - 86_400_000),
    auto("b", NOW - 86_400_000 + 1),
    auto("c", NOW - 86_400_000 - 1),
  ];
  expect(thinVersions(hourly, NOW)).toEqual({
    keep: ["a", "b"],
    remove: ["c"],
    mergeInto: new Map([["c", "a"]]),
  });
  const daily = [
    auto("d", NOW - 2_592_000_000),
    auto("e", NOW - 2_592_000_000 - 1),
    auto("f", NOW - 2_592_000_000 + 1),
  ];
  expect(thinVersions(daily, NOW)).toEqual({
    keep: ["d", "f"],
    remove: ["e"],
    mergeInto: new Map([["e", "d"]]),
  });
});
