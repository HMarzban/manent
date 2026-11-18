// One person on two devices in a real browser: what one typed offline merges with what the
// other typed online.
import { expect, test } from "@playwright/test";
import { openHarness, until } from "./support.ts";

test("one person on two devices, one offline, re-merges", async ({
  browser,
}) => {
  // two contexts: two stores, two connections
  const [first, second] = [
    await (await browser.newContext()).newPage(),
    await (await browser.newContext()).newPage(),
  ];
  await openHarness(first, "dana");
  const docId = await first.evaluate(() =>
    window.harness.create({ kind: "private", home: "user" }),
  );
  await openHarness(second, "dana");
  await second.evaluate((id) => window.harness.open(id), docId);
  await until(second, () => window.harness.status().synced);
  await second.context().setOffline(true);
  await second.evaluate(() => window.harness.type("typed offline"));
  await first.evaluate(() => window.harness.type("typed online"));
  await second.context().setOffline(false);
  await second.evaluate(() => window.harness.retryNow());
  await until(second, () => window.harness.status().synced);
  await until(first, () => window.harness.text().includes("typed offline"));
  expect(await first.evaluate(() => window.harness.text())).toBe(
    await second.evaluate(() => window.harness.text()),
  );
  await Promise.all([first.context().close(), second.context().close()]);
});
