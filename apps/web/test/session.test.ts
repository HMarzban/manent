import { expect, test } from "bun:test";
import {
  SESSION_KEY,
  chooseUrl,
  createTabSession,
  personLabel,
  safeNext,
  startScreen,
} from "../src/session.ts";
import type { TabStorage } from "../src/session.ts";

function fakeStorage(): TabStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

function refuse(): never {
  throw new Error("storage is disabled");
}

function throwingStorage(): TabStorage {
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
}

function storageHolding(value: string): TabStorage {
  const storage = fakeStorage();
  storage.setItem(SESSION_KEY, value);
  return storage;
}

const leo = { token: "tok", userId: "leo", name: "Leo Marsh" };

test("the person belongs to the tab, name included", () => {
  const storage = fakeStorage();
  createTabSession(storage).set(leo);
  expect(createTabSession(storage).get()).toEqual(leo);
  createTabSession(storage).set(null);
  expect(storage.getItem(SESSION_KEY)).toBeNull();
});

test("a browser that refuses tab storage still works for this page load", () => {
  const s = createTabSession(throwingStorage());
  s.set(leo);
  expect(s.get()).toEqual(leo);
  const none = createTabSession(null);
  none.set(leo);
  expect(none.get()).toEqual(leo);
  expect(createTabSession(storageHolding("{not json")).get()).toBeNull();
  expect(createTabSession(storageHolding('{"token":"tok"}')).get()).toBeNull();
});

test("where to start", () => {
  expect(startScreen(null, "unknown")).toBe("choose");
  for (const me of ["ok", "unknown", "unreachable"] as const)
    expect(startScreen(leo, me)).toBe("library");
  expect(startScreen(leo, "unauthenticated")).toBe("choose");
});

test("after a reload while /api/me is unreachable the bar still reads Person: Leo Marsh", () => {
  expect(personLabel(leo)).toBe("Person: Leo Marsh");
  expect(personLabel(null)).toBe("Person");
});

test("next is only ever a path inside the app", () => {
  expect(chooseUrl("/s/abc?x=1")).toBe("/choose?next=%2Fs%2Fabc%3Fx%3D1");
  for (const bad of [
    null,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
  ])
    expect(safeNext(bad)).toBe("/");
  expect(safeNext("/s/abc")).toBe("/s/abc");
});
