// The device's store taken away or refusing: what comes back from the server is told, and typing never stops.
import { expect } from "@playwright/test";
import { committedOnDevice } from "../support/tour.ts";
import {
  SPEECH,
  message,
  newDevice,
  pageText,
  personIn,
  readStatus,
  renameScript,
  setConnection,
  syncHook,
  test,
  typeIn,
  writeScript,
} from "./support.ts";

// two people in browsers of their own, each signing in, take longer than the default
test.describe.configure({ timeout: 120_000 });

/** The title of the script kept only on this device. */
const KEPT_HERE = "The last crossing";

test("storage cleared by the browser: synced scripts come back and the one kept only here is named", async ({
  browser,
}) => {
  // a page a service worker controls hides its requests from page.route in WebKit
  const context = await newDevice(browser, { serviceWorkers: "block" });
  const page = await personIn(context, "dana");
  await writeScript(page);
  // a script whose first sync cannot reach the server stays only here, while the person's index syncs what it holds
  await page.route("**/api/docs", (route) =>
    route.request().method() === "POST" ? route.abort() : route.fallback(),
  );
  await page.getByRole("button", { name: "‹ Library" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  const newScript = page
    .locator('[data-region="title_bar"]')
    .getByRole("button", { name: "New script", exact: true });
  await expect(newScript).toBeEnabled();
  await newScript.click();
  await expect(page).toHaveURL(/\/s\//, { timeout: 15_000 });
  await renameScript(page, KEPT_HERE);
  // named first, so the line typed after it gives the person's index time to reach the server
  await typeIn(page, { element: "scene_heading", nth: 0 }, "INT. FERRY DECK");
  await committedOnDevice(page, "dana");
  await page.getByRole("button", { name: "‹ Library" }).click();
  // a page of the app's origin that runs none of it, so nothing holds the databases open
  await page.goto("/health");
  await page.unroute("**/api/docs");
  await page.evaluate(async () => {
    for (const { name } of await indexedDB.databases())
      if (name !== undefined)
        await new Promise((resolve, reject) => {
          const deleting = indexedDB.deleteDatabase(name);
          deleting.addEventListener("success", resolve);
          deleting.addEventListener("error", () => reject(deleting.error));
        });
  });
  await page.goto("/");
  await expect(
    message(
      page,
      `This browser cleared Manent's offline data. 1 synced script is back. '${KEPT_HERE}' existed only here and cannot be recovered.`,
    ),
  ).toBeVisible({ timeout: 30_000 });
});

test("a store that refuses: typing continues and the status says so, online and offline", async ({
  browser,
}) => {
  const page = await personIn(await newDevice(browser), "dana");
  await writeScript(page);
  await syncHook(page, "refuseStore", "quota");
  try {
    await typeIn(page, SPEECH, " tonight");
    await expect
      .poll(() => readStatus(page))
      .toBe("Not saved on this device · Synced");
    await setConnection(page, "offline");
    await typeIn(page, SPEECH, " at last");
    await expect
      .poll(() => readStatus(page))
      .toBe("Can't save on this device — export a copy");
    expect(await pageText(page)).toContain("The boats are in tonight at last");
  } finally {
    await syncHook(page, "refuseStore", null);
  }
});
