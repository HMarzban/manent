import { expect, test } from "bun:test";
import type { StorageManagerLike } from "../src/index.ts";
import { readPersistence, requestPersistence } from "../src/index.ts";

/** A browser's storage manager that has or has not kept the data, and grants a request when `grant` is true; `asked` counts the requests. */
function fakeManager(options: {
  persisted: boolean;
  grant?: boolean;
}): StorageManagerLike & { asked: number } {
  const manager = {
    asked: 0,
    persisted: async () => options.persisted,
    persist: async () => {
      manager.asked += 1;
      return options.grant ?? false;
    },
  };
  return manager;
}

test("persistent storage is asked for once, and never again once it is granted", async () => {
  const m = fakeManager({ persisted: false, grant: true });
  expect(await requestPersistence(m)).toBe("granted");
  expect(m.asked).toBe(1);
  const kept = fakeManager({ persisted: true });
  expect(await requestPersistence(kept)).toBe("granted");
  expect(kept.asked).toBe(0);
  expect(await requestPersistence(null)).toBe("unsupported");
  expect(await requestPersistence({})).toBe("unsupported");
  expect(
    await requestPersistence(fakeManager({ persisted: false, grant: false })),
  ).toBe("not_granted");
});

test("reading whether storage is kept never asks", async () => {
  const kept = fakeManager({ persisted: true });
  const notKept = fakeManager({ persisted: false, grant: true });
  expect([
    await readPersistence(kept),
    await readPersistence(notKept),
    await readPersistence(null),
    await readPersistence({}),
    kept.asked + notKept.asked,
  ]).toEqual(["granted", "not_granted", "unsupported", "unsupported", 0]);
});
