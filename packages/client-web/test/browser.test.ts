// The package is imported only inside the tests, so that an import which touched a
// browser global would fail them rather than the file's loading.
import { expect, test } from "bun:test";
import { blankMeta } from "@manent/sync-client/testing";
import { IDBFactory } from "fake-indexeddb";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";

test("a client id is an unsigned 32-bit integer and random bytes have the length asked for", async () => {
  const { browserRandom } = await import("../src/index.ts");
  const ids = Array.from({ length: 1_000 }, () => browserRandom.clientId());
  expect(
    ids.filter((id) => !Number.isInteger(id) || id < 0 || id >= 2 ** 32),
  ).toEqual([]);
  expect(new Set(ids).size).toBeGreaterThan(990);
  const bytes = browserRandom.bytes(10);
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(bytes.length).toBe(10);
  const draw = browserRandom.next();
  expect(draw >= 0 && draw < 1).toBe(true);
});

test("importing the package touches no browser global", async () => {
  // Bun has no navigator.locks, requestAnimationFrame or indexedDB
  const exported = await import("../src/index.ts");
  expect(typeof exported.browserPorts).toBe("function");
});

test("without Web Locks a tab's ports lead by a lease that also fences its store", async () => {
  const { browserPorts } = await import("../src/index.ts");
  // Bun has no navigator.locks; the database is installed for this test alone
  globalThis.indexedDB = new IDBFactory();
  try {
    const ports = await browserPorts({
      baseUrl: "http://localhost:4799",
      session: () => null,
      userId: "dana",
    });
    expect(ports.leader.tabId).toMatch(/^[0-9a-f]{32}$/);
    await expect(ports.store.create(blankMeta(DOC))).rejects.toMatchObject({
      code: "lost_lead",
    });
    let giveUp: (() => void) | null = null;
    await new Promise<void>((elected) => {
      giveUp = ports.leader.campaign({
        onElected: elected,
        onDeposed: () => {},
      });
    });
    await ports.store.create(blankMeta(DOC));
    expect((await ports.store.documents()).map((meta) => meta.docId)).toEqual([
      DOC,
    ]);
    giveUp!();
  } finally {
    Reflect.deleteProperty(globalThis, "indexedDB");
  }
});
