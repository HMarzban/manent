import { expect, test } from "bun:test";
import { createSubscribable, deriveStatus } from "../src/index.ts";
import type { StatusInput, StoredSetting, StoredUpdate } from "../src/index.ts";

/** An own, unacknowledged update that edited one element; its bytes are never read here. */
function entry(localSeq: number, bytes: number): StoredUpdate {
  return {
    kind: "update",
    localSeq,
    update: new Uint8Array(bytes),
    own: true,
    acked: false,
    applied: true,
    elements: [`element-${localSeq}`],
  };
}

function setting(localSeq: number): StoredSetting {
  return {
    kind: "set",
    localSeq,
    key: "script.paper",
    value: '"a4"',
    acked: false,
  };
}

const base: StatusInput = {
  link: "online",
  subscribed: true,
  merged: true,
  entries: [],
  unsavedWrites: 0,
  storeRefusing: false,
  wentOfflineAt: null,
  neverSynced: false,
  recovered: 0,
  side: [],
};

test("synced means online, subscribed, merged and nothing waiting — and nothing less", () => {
  expect(deriveStatus(base)).toEqual({
    saved: true,
    synced: true,
    waiting: 0,
    link: "online",
    docSync: "synced",
    wentOfflineAt: null,
    neverSynced: false,
    recovered: 0,
    side: [],
  });
  for (const change of [
    { link: "offline" },
    { link: "authenticating" },
    { subscribed: false },
    { merged: false },
    { entries: [entry(1, 1)] },
    { entries: [setting(1)] },
  ] as Partial<StatusInput>[])
    expect(deriveStatus({ ...base, ...change }).synced).toBe(false);
});

test("an own edit that touched no element still keeps the document from synced", () => {
  expect(
    deriveStatus({ ...base, entries: [{ ...entry(1, 1), elements: [] }] }),
  ).toMatchObject({ synced: false, waiting: 0, docSync: "syncing" });
});

test("saved is about this device only", () => {
  expect(
    deriveStatus({ ...base, link: "offline", entries: [entry(1, 1)] }),
  ).toMatchObject({ saved: true, synced: false, waiting: 1, docSync: "local" });
  expect(deriveStatus({ ...base, unsavedWrites: 1 }).saved).toBe(false);
  // not saved here, yet on the server
  expect(deriveStatus({ ...base, storeRefusing: true })).toMatchObject({
    saved: false,
    synced: true,
    side: ["not_saved"],
  });
});

test("side states are listed once each, in their fixed order", () => {
  expect(
    deriveStatus({
      ...base,
      storeRefusing: true,
      side: ["server_old", "not_saved", "access_removed", "server_old"],
    }).side,
  ).toEqual(["access_removed", "not_saved", "server_old"]);
});

test("a subscribable tells its listeners only of a change", () => {
  const s = createSubscribable({ a: 1 });
  const seen: unknown[] = [];
  const stop = s.subscribe((v) => seen.push(v));
  s.set({ a: 1 });
  s.set({ a: 2 });
  stop();
  s.set({ a: 3 });
  expect(seen).toEqual([{ a: 2 }]);
  expect(s.get()).toEqual({ a: 3 });
});

test("a subscribable compares nested values, arrays and bytes by content", () => {
  const s = createSubscribable<unknown>({
    list: [1, { b: "x" }],
    bytes: new Uint8Array([1, 2]),
  });
  const seen: unknown[] = [];
  s.subscribe((v) => seen.push(v));
  const values: unknown[] = [
    { list: [1, { b: "x" }], bytes: new Uint8Array([1, 2]) },
    { list: [1, { b: "x" }], bytes: new Uint8Array([1, 3]) },
    { list: [1, { b: "y" }], bytes: new Uint8Array([1, 3]) },
    { list: { 0: 1, 1: { b: "y" } }, bytes: new Uint8Array([1, 3]) },
    { list: { 0: 1, 1: { b: "y" } }, bytes: [1, 3] },
    { list: { 0: 1, 1: { b: "y" } }, bytes: [1, 3] },
  ];
  for (const value of values) s.set(value);
  expect(seen).toEqual(values.slice(1, 5));
});
