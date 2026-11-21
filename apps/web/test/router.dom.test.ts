import { withDom } from "@manent/testkit/dom";
import { createMemoryHistory } from "@tanstack/react-router";
import { expect, test } from "bun:test";
import { createAppRouter, loadScreen } from "../src/router.tsx";
import { SESSION_KEY } from "../src/session.ts";
import type { TabStorage } from "../src/session.ts";
import { createPersonStore } from "../src/state/person.store.ts";
import { fakeApi } from "./services.fixtures.ts";

withDom();

// the message WebKit gives a module whose fetch it cancelled, which the router reads as a newer build
const cancelled = new TypeError("Importing a module script failed.");

/** A load that fails once `fail` is called. */
function failingLoad(): { importer: () => Promise<never>; fail(): void } {
  const { promise, reject } = Promise.withResolvers<never>();
  return { importer: () => promise, fail: () => reject(cancelled) };
}

/** What `loading` has done once every pending callback has run: settled with a value, failed with an error, or neither. */
async function outcome(loading: Promise<unknown>): Promise<unknown> {
  const settled = loading.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  const pending = new Promise((resolve) => setImmediate(resolve, "pending"));
  return Promise.race([settled, pending]);
}

test("a screen's code that stops loading because the page has begun to leave never settles, so the page is not reloaded under the navigation", async () => {
  const { importer, fail } = failingLoad();
  const loading = loadScreen(importer)();
  window.dispatchEvent(new Event("beforeunload"));
  fail();
  expect(await outcome(loading)).toBe("pending");
});

test("a screen's code that cannot load while the page stays fails as it was given", async () => {
  const { importer, fail } = failingLoad();
  const loading = loadScreen(importer)();
  fail();
  expect(await outcome(loading)).toEqual({ error: cancelled });
});

const DOC = "/s/01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";

/** A tab's storage holding `stored` as its person, or no person. */
function storageOf(stored: string | null): TabStorage {
  return {
    getItem: (key) => (key === SESSION_KEY ? stored : null),
    setItem: () => {},
    removeItem: () => {},
  };
}

/** Where a tab whose storage holds `stored` ends once the app's router has loaded `address`. */
async function landing(
  address: string,
  stored: string | null,
): Promise<string> {
  const router = createAppRouter({
    api: fakeApi(),
    fetch,
    usePerson: createPersonStore(storageOf(stored)),
  });
  router.update({
    ...router.options,
    history: createMemoryHistory({ initialEntries: [address] }),
  });
  await router.load();
  return router.state.location.href;
}

test("a tab with no person that opens any screen but the chooser is asked who it is, with the address to return to", async () => {
  const addresses = [
    "/",
    DOC,
    `${DOC}/send/export`,
    "/preferences",
    "/preferences/writing?from=%2F",
    "/choose?next=%2Fpreferences",
  ];
  const landed = [];
  for (const address of addresses) landed.push(await landing(address, null));
  expect(landed).toEqual([
    "/choose?next=%2F",
    "/choose?next=%2Fs%2F01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd",
    "/choose?next=%2Fs%2F01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd%2Fsend%2Fexport",
    "/choose?next=%2Fpreferences",
    "/choose?next=%2Fpreferences%2Fwriting%3Ffrom%3D%252F",
    "/choose?next=%2Fpreferences",
  ]);
});

test("a tab that has a person opens a script's address as it is", async () => {
  const leo = JSON.stringify({ token: null, userId: "leo", name: "Leo Marsh" });
  expect(await landing(DOC, leo)).toBe(DOC);
});
