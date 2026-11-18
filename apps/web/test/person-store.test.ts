import { expect, test } from "bun:test";
import { createPersonStore } from "../src/person-store.ts";
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

test("the store is the one holder of the person, and storage that refuses is not a failure", () => {
  const storage = fakeStorage();
  const use = createPersonStore(storage);
  use.getState().setPerson({ token: "t", userId: "leo", name: "Leo Marsh" });
  expect(createPersonStore(storage).getState().person).toEqual({
    token: "t",
    userId: "leo",
    name: "Leo Marsh",
  }); // a reload
  const refused = createPersonStore(throwingStorage());
  refused
    .getState()
    .setPerson({ token: "t", userId: "leo", name: "Leo Marsh" });
  expect(refused.getState().person?.userId).toBe("leo"); // kept for this page load
});
