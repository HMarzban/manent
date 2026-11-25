import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { createDoc } from "@manent/crdt";
import {
  currentDriver,
  refreshDriver,
  watchDriver,
} from "../src/room/driver.ts";
import { tabStorage, writePerson } from "../src/session.ts";
import { testServices } from "./services.fixtures.ts";
import { fakeHandle, turn } from "./sync.fixtures.ts";

withDom();

const DOC_ID = "984682f4-e8ec-80ad-92f4-cdf10d9e0cc3";
const DANA = { userId: "dana", name: "Dana Reyes" };
const SAM = { token: "token-sam", userId: "sam", name: "Sam Okafor" };

const encodeControl = (payload: object): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(payload));

test("a stale GET /api/driver/current response never overwrites a newer driver_changed control event", async () => {
  writePerson(tabStorage(), SAM);
  const handle = fakeHandle(DOC_ID, createDoc({ clientId: 1 }));
  const services = {
    ...testServices({ userId: SAM.userId }),
    openHandle: async () => handle,
  };

  const firstFetch = Promise.withResolvers<Response>();
  let fetches = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(
    async () => {
      fetches += 1;
      if (fetches === 1) return firstFetch.promise;
      return new Response(JSON.stringify({ driver: null }), { status: 200 });
    },
    { preconnect: originalFetch.preconnect },
  );

  const stop = watchDriver(DOC_ID, services, { emitMessages: true });
  try {
    await turn();
    expect(fetches).toBe(1);

    // while GET /api/driver/current is in flight, Dana takes keys and CONTROL driver_changed arrives
    handle.emit({
      type: "control",
      kind: "driver_changed",
      data: encodeControl({ docId: DOC_ID, driver: DANA, at: 1 }),
    });
    expect(currentDriver(SAM.userId, DOC_ID)).toEqual(DANA);

    // the stale GET /api/driver/current resolves with { driver: null }
    firstFetch.resolve(
      new Response(JSON.stringify({ driver: null }), { status: 200 }),
    );
    await turn();

    expect(currentDriver(SAM.userId, DOC_ID)).toEqual(DANA);

    // a fresh refreshDriver after no newer control events does apply the server's state
    const refreshed = await refreshDriver(SAM.userId, DOC_ID);
    expect(refreshed).toEqual({ ok: true, driver: null });
    expect(currentDriver(SAM.userId, DOC_ID)).toBeNull();
  } finally {
    stop();
    globalThis.fetch = originalFetch;
    writePerson(tabStorage(), null);
  }
});
