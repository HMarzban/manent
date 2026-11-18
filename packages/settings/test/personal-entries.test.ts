import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  UNSET,
  createPersonalBag,
  entryKey,
  latestEntries,
} from "../src/index.ts";
import type { KeyValueMap, PrefEntry } from "../src/index.ts";

type Listener = Parameters<KeyValueMap["subscribe"]>[0];

function sharedMap(initial: Record<string, unknown>) {
  const entries = new Map(Object.entries(initial));
  const listeners = new Set<Listener>();
  const tell: Listener = (keys, origin) => {
    for (const listener of listeners) listener(keys, origin);
  };
  return {
    get: (key: string): unknown => entries.get(key),
    set(key: string, value: unknown) {
      entries.set(key, value);
      tell([key], "local");
    },
    keys: () => [...entries.keys()],
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    receive(key: string, value: unknown) {
      entries.set(key, value);
      tell([key], "remote");
    },
    contents: () => Object.fromEntries(entries),
  };
}

test("one entry per preference and device; the latest wins; a reset is an entry", () => {
  const map = {
    [entryKey("appearance.theme", "d_7f3a")]: {
      v: "dark",
      at: 10,
      on: "Chrome on macOS",
      unset: false,
    },
    [entryKey("appearance.theme", "d_c210")]: {
      v: null,
      at: 20,
      on: "Manent for Windows",
      unset: true,
    },
    "future.key|d_1": { v: 1, at: 1, on: "x", unset: false },
  };
  expect(latestEntries(map).get("appearance.theme")).toMatchObject({
    unset: true,
    deviceId: "d_c210",
  });
  expect(entryKey("appearance.theme", "d_7f3a")).toBe(
    "appearance.theme|d_7f3a",
  );
});

test("a personal bag writes only its own device's entry and keeps keys it does not know", () => {
  const elsewhere = {
    "writing.flag|d_c210": {
      v: true,
      at: 5,
      on: "Manent for Windows",
      unset: false,
    },
    "future.key|d_1": { v: 1, at: 1, on: "x", unset: false },
  };
  const map = sharedMap(elsewhere);
  const bag = createPersonalBag({
    map,
    deviceId: "d_7f3a",
    deviceName: "Manent for macOS",
    now: () => 10,
  });
  expect([bag.read(), bag.provenance("writing.flag")]).toEqual([
    { "writing.flag": true, "future.key": 1 },
    { at: 5, on: "Manent for Windows", byUserId: null, was: null },
  ]);

  bag.write({ "writing.flag": UNSET, "appearance.theme": "dark" });
  expect(map.contents()).toEqual({
    ...elsewhere,
    "writing.flag|d_7f3a": {
      v: null,
      at: 10,
      on: "Manent for macOS",
      unset: true,
    },
    "appearance.theme|d_7f3a": {
      v: "dark",
      at: 10,
      on: "Manent for macOS",
      unset: false,
    },
  });
  expect([bag.read(), bag.provenance("appearance.theme")]).toEqual([
    { "future.key": 1, "appearance.theme": "dark" },
    { at: 10, on: null, byUserId: null, was: null },
  ]);
});

test("a change in the shared map is heard as its preference, with where it came from", () => {
  const map = sharedMap({});
  const bag = createPersonalBag({
    map,
    deviceId: "d_7f3a",
    deviceName: "Manent for macOS",
    now: () => 10,
  });
  const heard: [readonly string[], string][] = [];
  bag.subscribe((keys, origin) => heard.push([keys, origin]));
  bag.write({ "writing.flag": true });
  map.receive("writing.flag|d_c210", {
    v: false,
    at: 11,
    on: "Manent for Windows",
    unset: false,
  });
  map.receive("not an entry", 1);
  expect([heard, bag.read()]).toEqual([
    [
      [["writing.flag"], "local"],
      [["writing.flag"], "remote"],
    ],
    { "writing.flag": false },
  ]);
});

test("a tie goes to the larger device id, and a malformed entry is skipped", () => {
  const entry = { v: true, at: 7, on: "Manent for macOS", unset: false };
  expect(
    latestEntries({
      "writing.flag|d_e": { ...entry, at: Number.NaN },
      "writing.flag|d_a": entry,
      "writing.flag|d_b": { ...entry, v: false, on: "Manent for Linux" },
      "writing.flag|d_c": { v: true, at: 99, on: "x" },
      "writing.flag|d_d": { ...entry, at: "late" },
      "writing.flag|d_f": { ...entry, on: null },
      "writing.flag|d_g": { at: 99, on: "x", unset: false },
      "writing.flag|d_h": "garbage",
      "writing.flag|d_i": null,
      "writing.flag": { ...entry, at: 99 },
      "|d_j": { ...entry, at: 99 },
      "writing.flag|": { ...entry, at: 99 },
    }),
  ).toEqual(
    new Map([
      [
        "writing.flag",
        {
          v: false,
          at: 7,
          on: "Manent for Linux",
          unset: false,
          deviceId: "d_b",
        },
      ],
    ]),
  );
});

const SETTING_KEYS = ["writing.flag", "appearance.theme"];
const DEVICES = ["d_1", "d_2", "d_3"];
const wellFormed = fc.record({
  v: fc.constantFrom(true, false, "dark", null),
  at: fc.constantFrom(1, 2, 3),
  on: fc.constantFrom("Manent for macOS", "Manent for Windows"),
  unset: fc.boolean(),
});
const anyEntry = fc.oneof(
  wellFormed,
  wellFormed.map((e) => ({ v: e.v, at: e.at, on: e.on })),
  wellFormed.map((e) => ({ ...e, at: String(e.at) })),
  fc.anything(),
);
const anyKey = fc.oneof(
  fc
    .tuple(fc.constantFrom(...SETTING_KEYS), fc.constantFrom(...DEVICES))
    .map(([key, device]) => entryKey(key, device)),
  fc.constantFrom(...SETTING_KEYS),
  fc.string(),
);

const isWellFormed = (value: unknown): value is PrefEntry =>
  typeof value === "object" &&
  value !== null &&
  "v" in value &&
  "at" in value &&
  typeof value.at === "number" &&
  Number.isFinite(value.at) &&
  "on" in value &&
  typeof value.on === "string" &&
  "unset" in value &&
  typeof value.unset === "boolean";

test("whatever the map holds, each preference reads its latest well-formed entry", () => {
  fc.assert(
    fc.property(fc.dictionary(anyKey, anyEntry), (map) => {
      const expected = new Map<string, PrefEntry & { deviceId: string }>();
      for (const [key, value] of Object.entries(map)) {
        const bar = key.indexOf("|");
        if (bar <= 0 || bar === key.length - 1 || !isWellFormed(value))
          continue;
        const settingKey = key.slice(0, bar);
        const deviceId = key.slice(bar + 1);
        const best = expected.get(settingKey);
        const later =
          best === undefined ||
          value.at > best.at ||
          (value.at === best.at && deviceId > best.deviceId);
        if (!later) continue;
        const { v, at, on, unset } = value;
        expected.set(settingKey, { v, at, on, unset, deviceId });
      }
      expect(latestEntries(map)).toEqual(expected);
    }),
    { numRuns: 500 },
  );
});
