// The Tour's write-outline scenario: opening 206's outline beside the empty script and starting 31 scene headings.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
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

tourScenario("write-outline", async ({ page, scenario, step }) => {
  const [beatsLine, startedMessage] = scenario.evidence;
  await selectTourStep(page, scenario.promise, 0);
  await page.getByRole("heading", { level: 1 }).getByRole("button").click();
  await (await step(0)).click();
  await page
    .getByRole("option", { name: /Outline/ })
    .first()
    .click();
  await expectEvidence([page], { ...scenario, evidence: [beatsLine!] });
  await (await step(1)).click();
  await expectEvidence([page], { ...scenario, evidence: [startedMessage!] });
  await (await step(2)).click();
  await expect(
    page.locator("[data-region='left_panel']").getByRole("listitem"),
  ).toHaveCount(31);
});
