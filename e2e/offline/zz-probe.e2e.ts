import { synced } from "./scenarios.ts";
import { asPerson, goOffline, goOnline, readStatus, test, writeScript } from "./support.ts";
import { expect } from "@playwright/test";
test.describe.configure({ timeout: 240_000 });
test("probe", async ({ browser }) => {
  for (let i = 0; i < 8; i++) {
    const first = await synced(browser).catch((e) => { console.log("first failed", String(e).slice(0, 80)); throw e; });
    await goOffline(first.context(), first);
    await expect.poll(() => readStatus(first), { timeout: 10000 }).toBe("Saved · Offline");
    await goOnline(first.context(), first);
    await first.context().close();
    const page = await asPerson(browser, "dana");
    const t = Date.now();
    let slow = false;
    await writeScript(page).catch(() => { slow = true; });
    const s: string[] = [];
    if (slow) {
      for (let k = 0; k < 60; k++) { s.push(`${Date.now() - t}:${await readStatus(page)}`); if (s.at(-1)!.endsWith("Synced")) break; await page.waitForTimeout(500); }
    }
    console.log("iter", i, Date.now() - t, slow ? "SLOW " + s.join(" | ") : "ok");
    await page.context().close();
  }
});
