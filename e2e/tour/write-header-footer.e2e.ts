// The Tour's write-header-footer scenario: setting Custom Header (Centre: Title, Right: Page of total) and comparing Export.
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

tourScenario("write-header-footer", async ({ page, scenario, step }) => {
  const [customMessage, pageOfTotal] = scenario.evidence;
  await selectTourStep(page, scenario.promise, 0);
  await page.getByRole("heading", { level: 1 }).getByRole("button").click();
  await (await step(0)).click();
  const headerRow = await step(1);
  await headerRow.getByRole("combobox", { name: "Header" }).click();
  await page.getByRole("option", { name: "Custom", exact: true }).click();
  await expectEvidence([page], { ...scenario, evidence: [customMessage!] });
  await headerRow.getByRole("combobox", { name: "Centre" }).click();
  await page.getByRole("option", { name: "Title", exact: true }).click();
  await headerRow.getByRole("combobox", { name: "Right" }).click();
  await page
    .getByRole("option", { name: "Page of total", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Back|Close/i })
    .first()
    .click();
  await expect(page.locator("[data-tour='page']")).toContainText(pageOfTotal!);
  await selectTourStep(page, scenario.promise, 2);
  await page.getByRole("heading", { level: 1 }).getByRole("button").click();
  await (await step(2)).click();
  await expectEvidence([page], { ...scenario, evidence: [pageOfTotal!] });
});
