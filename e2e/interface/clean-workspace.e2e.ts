// Clean workspace mode end-to-end: clicking "Start in a clean workspace" on Choose removes Demo & Tour,
// lands on an empty Library, survives reload and new tabs, passes WCAG 2.2 AA, and restores cleanly from Preferences.
import AxeBuilder from "@axe-core/playwright";
import { CHOOSE_WORDS, DEMO_WORDS, PREFERENCES_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag22aa"];

async function expectPageAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .exclude("[data-base-ui-focus-guard]")
    .withTags(AXE_TAGS)
    .analyze();
  expect(results.violations).toEqual([]);
}

test("Start in a clean workspace removes Demo and Tour, lands on an empty Library, persists across reloads and tabs, and restores from Preferences", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const shotDir = process.env.CLEAN_WORKSPACE_SHOT_DIR ?? null;

  try {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/choose");
    await expect(
      page.getByRole("heading", { name: "Choose who you are" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: DEMO_WORDS.demo }),
    ).toBeVisible();

    const cta = page.getByRole("button", {
      name: CHOOSE_WORDS.cleanWorkspaceTitle,
    });
    await expect(cta).toBeVisible();
    await expect(cta).toContainText(CHOOSE_WORDS.cleanWorkspaceBodyWeb);

    // Light and Dark axe audit on Choose screen with the new CTA
    await expectPageAxeClean(page);
    if (shotDir !== null) {
      await page.screenshot({
        path: `${shotDir}/choose-clean-cta-dark.png`,
        fullPage: false,
      });
    }

    await page.emulateMedia({ colorScheme: "light" });
    await page.reload();
    await expect(cta).toBeVisible();
    await expectPageAxeClean(page);
    if (shotDir !== null) {
      await page.screenshot({
        path: `${shotDir}/choose-clean-cta-light.png`,
        fullPage: false,
      });
    }

    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expect(cta).toBeVisible();

    // Activate Clean workspace mode
    await cta.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
    await expect(page.getByText("No scripts yet")).toBeVisible();

    // Zero Demo or Tour surfaces remain
    await expect(page.locator("[data-surface='demo']")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: DEMO_WORDS.demo }),
    ).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Tour" })).toHaveCount(0);
    await expect(page).toHaveTitle(/Manent$/);
    await expect(page).not.toHaveTitle(/demo/i);

    await expectPageAxeClean(page);
    if (shotDir !== null) {
      await page.screenshot({
        path: `${shotDir}/clean-empty-library-dark.png`,
        fullPage: false,
      });
    }

    // Reload stays in clean empty Library without Demo/Tour or bouncing to /choose
    await page.reload();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("No scripts yet")).toBeVisible();
    await expect(page.locator("[data-surface='demo']")).toHaveCount(0);

    // Fresh tab auto-enters the clean workspace directly (no /choose bounce)
    const tab2 = await context.newPage();
    await tab2.goto("/");
    await expect(tab2).toHaveURL(/\/$/);
    await expect(tab2.getByText("No scripts yet")).toBeVisible();
    await expect(tab2.locator("[data-surface='demo']")).toHaveCount(0);
    await tab2.close();

    // Create a personal script so we verify restoring Demo & Tour preserves user work
    await page.getByRole("button", { name: "New script" }).first().click();
    await expect(page).toHaveURL(/\/s\//);
    await expect(page.locator("[data-surface='demo']")).toHaveCount(0);

    // Restore Demo & Tour from Preferences → This browser
    await page.goto("/preferences/device");
    const restoreBtn = page.getByRole("button", {
      name: PREFERENCES_WORDS.restoreDemoAndTour,
    });
    await expect(restoreBtn).toBeVisible();
    await restoreBtn.click();

    await expect(
      page.getByRole("region", { name: DEMO_WORDS.demo }),
    ).toBeVisible();
    await expect(restoreBtn).toHaveCount(0);

    // Personal script is still present in the Library
    await page.goto("/");
    await expect(page.getByText("No scripts yet")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
