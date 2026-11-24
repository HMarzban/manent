// The Tour's together-note scenario: Dana addresses item 5 of 203's Network round and sees Harbour Lights read 3 open.
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

tourScenario("together-note", async ({ page, scenario, step }) => {
  const [filterText, resolvedMsg, stageOpen] = scenario.evidence;
  await (await step(0)).click();
  const side = page.locator("[data-region='side_panel']");
  await side
    .getByRole("button", { name: /Network/ })
    .first()
    .click();
  await expectEvidence([page], { ...scenario, evidence: [filterText!] });
  await selectTourStep(page, scenario.promise, 1);
  await side
    .getByText("Who is driving the safety boat? Name them.")
    .first()
    .click();
  const popover = await step(1);
  await popover.getByRole("button", { name: "Resolve", exact: true }).click();
  await page.getByRole("menuitem", { name: "Addressed", exact: true }).click();
  await expectEvidence([page], { ...scenario, evidence: [resolvedMsg!] });
  await page.getByRole("button", { name: "‹ Library" }).click();
  await page
    .getByRole("button", { name: /Harbour Lights/ })
    .first()
    .click();
  await step(2);
  await expectEvidence([page], { ...scenario, evidence: [stageOpen!] });
});
