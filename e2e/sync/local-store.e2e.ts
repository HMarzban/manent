// The local store in a real browser: an offline edit outlives a reload, each person has a
// store of their own, and a new seed forgets it.
import { expect, test } from "@playwright/test";
import { openHarness, until } from "./support.ts";

// Firefox refuses every navigation while offline, even one the test answers itself, and nothing
// serves the page offline yet: there the page reloads on the network with the socket's ticket refused
const TICKET = "**/api/ws-ticket";

test("an edit made offline survives a reload and syncs when the network is back", async ({
  page,
  context,
  browserName,
}) => {
  await openHarness(page, "dana");
  // a private document lives in its owner's own file and needs no one else
  const docId = await page.evaluate(() =>
    window.harness.create({ kind: "private", home: "user" }),
  );
  await until(page, () => window.harness.status().synced);
  await context.setOffline(true);
  await page.evaluate(() => window.harness.type("written with no network"));
  await until(
    page,
    () =>
      window.harness.status().saved && window.harness.status().waiting === 1,
  );
  const navigable = browserName !== "firefox";
  if (!navigable) {
    await page.route(TICKET, (request) =>
      request.abort("internetdisconnected"),
    );
    await context.setOffline(false);
  }
  await page.reload();
  await openHarness(page, "dana");
  await page.evaluate((id) => window.harness.open(id), docId);
  // from IndexedDB, with no server
  expect(await page.evaluate(() => window.harness.text())).toContain(
    "written with no network",
  );
  if (!navigable) await page.unroute(TICKET);
  await context.setOffline(false);
  await page.evaluate(() => window.harness.retryNow());
  await until(page, () => window.harness.status().synced);
});

test("two people in one browser keep separate stores", async ({ context }) => {
  const [a, b] = [await context.newPage(), await context.newPage()];
  await openHarness(a, "dana");
  await openHarness(b, "sam");
  await a.evaluate(() =>
    window.harness.create({ kind: "private", home: "user" }),
  );
  expect(await b.evaluate(() => window.harness.storeSummary())).toEqual({
    database: "manent:sam",
    documents: 0,
  });
  expect((await a.evaluate(() => window.harness.storeSummary())).database).toBe(
    "manent:dana",
  );
});

test("a new seed forgets the local store", async ({ page }) => {
  await openHarness(page, "dana", { seedId: "first" });
  await page.evaluate(() =>
    window.harness.create({ kind: "private", home: "user" }),
  );
  await openHarness(page, "dana", { seedId: "first" });
  expect(await page.evaluate(() => window.harness.storeSummary())).toEqual({
    database: "manent:dana",
    documents: 1,
  });
  await openHarness(page, "dana", { seedId: "second" });
  expect(await page.evaluate(() => window.harness.storeSummary())).toEqual({
    database: "manent:dana",
    documents: 0,
  });
});
