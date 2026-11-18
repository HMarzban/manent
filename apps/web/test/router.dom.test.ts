import { withDom } from "@manent/testkit/dom";
import { expect, test } from "bun:test";
import { loadScreen } from "../src/router.tsx";

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
