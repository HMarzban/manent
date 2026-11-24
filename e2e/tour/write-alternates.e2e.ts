// The Tour's write-alternates scenario: swapping in Dana's alternate on the traffic joke and restoring a cut.
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

tourScenario("write-alternates", async ({ page, scenario, step }) => {
  const [marker, swapped, restored] = scenario.evidence;
  const sheet = page.locator("[data-tour='page']");
  const joke = sheet
    .locator("[data-type='dialogue']", { hasText: "plan to end traffic" })
    .first();
  await joke.scrollIntoViewIfNeeded();
  await joke.click();
  await settled(page);
  await expectEvidence([page], { ...scenario, evidence: [marker!] });
  await selectTourStep(page, scenario.promise, 0);
  await page.getByRole("button", { name: "Script" }).click();
  await (await step(0)).click();
  const popover = await step(1);
  await popover
    .locator("li", {
      hasText: "Engineers call it ambitious. Cyclists call it overdue.",
    })
    .getByRole("button", { name: "Use this" })
    .click();
  await expectEvidence([page], { ...scenario, evidence: [swapped!] });
  await (await step(2)).click();
  await page
    .locator("[data-region='left_panel']")
    .getByRole("button", { name: /Restore ".*night market/i })
    .click();
  await expectEvidence([page], { ...scenario, evidence: [restored!] });
});
