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
  // the second's synced status covers what it sent and what the server held when it came back;
  // the first's typing may reach the server after that, and the second a moment later
  const merged = async (): Promise<{ same: boolean; lines: string[] }> => {
    const [one, two] = await Promise.all([
      first.evaluate(() => window.harness.text()),
      second.evaluate(() => window.harness.text()),
    ]);
    return { same: one === two, lines: one.split("\n").toSorted() };
  };
  await expect
    .poll(merged, { timeout: 30_000 })
    .toEqual({ same: true, lines: ["typed offline", "typed online"] });
  await Promise.all([first.context().close(), second.context().close()]);
});
