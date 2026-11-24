// The Tour's write-adapt scenario: opening Jumpox beside the play and turning Beside to chapter 6 at scene 4.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

/** Selects step `index` in the Tour before opening a menu or popover whose blur would otherwise dismiss it. */
async function selectTourStep(
  page: Page,
  promise: string,
  index: number,
): Promise<void> {
  const row = page
    .locator("[data-region='side_panel']")
    .getByRole("tabpanel", { name: DOCUMENT_WORDS.tourTab })
    .getByRole("listitem")
    .filter({ hasText: promise })
    .locator("ol > li > div")
    .nth(index);
  await row.click();
  await expect(row).toHaveAttribute("aria-current", "true");
}

tourScenario("write-adapt", async ({ page, scenario, step }) => {
  await selectTourStep(page, scenario.promise, 0);
  await page.getByRole("heading", { level: 1 }).getByRole("button").click();
  await (await step(0)).click();
  await page
    .getByRole("option", { name: /Jumpox — Spark & Looki/ })
    .first()
    .click();
  const sheet = await step(1);
  const scene4 = sheet
    .locator("[data-type='scene_heading']", {
      hasText: "Mrs. Lomax's Spectacles",
    })
    .first();
  await scene4.scrollIntoViewIfNeeded();
  await scene4.click();
  await settled(page);
  await step(2);
  await expectEvidence([page], scenario);
});
