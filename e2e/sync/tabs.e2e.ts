// One person's tabs in a real browser: one leads and holds the connection, and another
// takes over when it closes.
import { expect, test } from "@playwright/test";
import { openHarness, until } from "./support.ts";

test("two tabs of one person share one connection, and the second takes over when the first closes", async ({
  context,
}) => {
  const [a, b] = [await context.newPage(), await context.newPage()];
  await openHarness(a, "dana");
  const docId = await a.evaluate(() =>
    window.harness.create({ kind: "private", home: "user" }),
  );
  await openHarness(b, "dana");
  await b.evaluate((id) => window.harness.open(id), docId);
  expect([
    await a.evaluate(() => window.harness.leader()),
    await b.evaluate(() => window.harness.leader()),
  ]).toEqual([true, false]);
  await b.evaluate(() => window.harness.type("from the second tab"));
  await until(a, () => window.harness.text().includes("from the second tab"));
  await a.close();
  await until(b, () => window.harness.leader() === true);
  await b.evaluate(() => window.harness.type(" and after the handover"));
  await until(b, () => window.harness.status().synced);
});

test("without Web Locks the lease elects one leader", async ({ context }) => {
  // the lease outlives a closed tab by up to its length and one renewal
  test.setTimeout(60_000);
  const [a, b] = [await context.newPage(), await context.newPage()];
  await openHarness(a, "dana", { leader: "lease" });
  const docId = await a.evaluate(() =>
    window.harness.create({ kind: "private", home: "user" }),
  );
  await openHarness(b, "dana", { leader: "lease" });
  await b.evaluate((id) => window.harness.open(id), docId);
  expect([
    await a.evaluate(() => window.harness.leader()),
    await b.evaluate(() => window.harness.leader()),
  ]).toEqual([true, false]);
  await a.close();
  await until(b, () => window.harness.leader() === true);
});
