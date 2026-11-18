// The page's frame around the paged editor: its size, its sheets and what a sheet shows.
import { expect, test } from "@playwright/test";
import { serveHarness } from "./harness/serve.ts";

let harness: { url: string; stop(): Promise<void> };
test.beforeAll(async () => {
  harness = await serveHarness("editor");
});
test.afterAll(async () => {
  await harness.stop();
});

// The probe is reached with brackets: the lint refuses a member name that begins with an underscore.
test("the scaffold shows a page", async ({ page }) => {
  await page.goto(`${harness.url}?script=corpus:750`);
  expect(await page.evaluate(() => window["__mn"].ready)).toBe("ready");
  await expect(page.locator(".mn-page-view")).toHaveCSS("width", "816px");
  // the paper is the sheet beneath
  await expect(page.locator(".mn-page-view")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  expect(
    await page
      .locator(".mn-sheet")
      .first()
      .evaluate((e: HTMLElement) => [e.offsetWidth, e.offsetHeight]),
  ).toEqual([816, 1056]);
  await page.locator(".mn-page-view").click();
  await page.keyboard.type("a");
  const [live, cold] = await page.evaluate(() => [
    window["__mn"].pages(),
    window["__mn"].cold(),
  ]);
  expect(live).toEqual(cold);
});

// 96 + 4 × 8 px down; 144 + 67 × 9.6 px across (US Letter screenplay)
test("a sheet shows its revision, its header and its marks", async ({
  page,
}) => {
  await page.goto(`${harness.url}?script=corpus:750`);
  await page.evaluate(() => window["__mn"].ready);
  await page.evaluate(() =>
    window["__mn"].scaffold.setSheetDecor({
      key: "blue",
      sheet: (i) =>
        i === 1
          ? {
              rev: "blue",
              head: "Blue Rev. (16 Nov 2026)",
              marks: [{ y: 4, text: "*" }],
            }
          : null,
    }),
  );
  const second = page.locator('.mn-sheet[data-page="1"]');
  expect([
    await second.getAttribute("data-rev"),
    await second.getAttribute("data-rev-head"),
  ]).toEqual(["blue", "Blue Rev. (16 Nov 2026)"]);
  expect(
    await second
      .locator(".mn-mark")
      .evaluateAll((ms: HTMLElement[]) =>
        ms.map((m) => [m.dataset["text"], m.style.top, m.style.left]),
      ),
  ).toEqual([["*", "128px", "787.2px"]]);
  expect(
    await page.locator('.mn-sheet[data-page="0"]').getAttribute("data-rev"),
  ).toBeNull();
  await page.evaluate(() => window["__mn"].scaffold.setTint(true));
  await expect(page.locator(".mn-pages")).toHaveAttribute("data-tint", "on");
  await page.evaluate(() => window["__mn"].scaffold.setTint(false));
  expect(await page.locator(".mn-pages").getAttribute("data-tint")).toBeNull();
});
