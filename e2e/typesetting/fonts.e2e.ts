// The script font: the page waits for it, and is still shown and editable when it never arrives.
import { expect, test } from "@playwright/test";
import type { Route } from "@playwright/test";
import { serveHarness } from "./harness/serve.ts";

let harness: { url: string; stop(): Promise<void> };
test.beforeAll(async () => {
  harness = await serveHarness("editor");
});
test.afterAll(async () => {
  await harness.stop();
});

// The probe is reached with brackets: the lint refuses a member name that begins with an underscore.
test("the script font loads before the page is shown", async ({ page }) => {
  // the font files are held until the page has been seen waiting for them
  const held: Route[] = [];
  let release = false;
  await page.route("**/*.woff2", async (route) => {
    if (release) await route.continue();
    else held.push(route);
  });
  await page.goto(`${harness.url}?script=corpus:250`, {
    waitUntil: "domcontentloaded",
  });
  await expect.poll(() => held.length).toBeGreaterThanOrEqual(4);
  await expect(page.locator(".mn-pages")).toHaveClass(/fonts-loading/);
  release = true;
  for (const route of held) await route.continue();
  expect(await page.evaluate(() => window["__mn"].ready)).toBe("ready");
  await expect(page.locator(".mn-pages")).not.toHaveClass(/fonts-loading/);
});

test("a blocked font still gives an editable page", async ({ page }) => {
  await page.route("**/*.woff2", (route) => route.abort());
  await page.goto(`${harness.url}?script=corpus:250`);
  expect(await page.evaluate(() => window["__mn"].ready)).toBe("fallback");
  await expect(page.locator(".mn-pages")).not.toHaveClass(/fonts-loading/);
  await page.locator(".mn-page-view").click();
  await page.keyboard.type("still here");
  const [text, live, cold] = await page.evaluate(() => [
    window["__mn"].view.state.doc.textContent.includes("still here"),
    window["__mn"].pages(),
    window["__mn"].cold(),
  ]);
  expect([text, live]).toEqual([true, cold]);
});
