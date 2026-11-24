// The Tour's together-style scenario: Dana changes Scene Heading Space before in Project settings and checks 205's Script settings.
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

tourScenario("together-style", async ({ page, scenario, step }) => {
  const [lockedCountLine, inheritedRow] = scenario.evidence;
  await selectTourStep(page, scenario.promise, 0);
  await page.getByRole("heading", { level: 1 }).getByRole("button").click();
  await (await step(0)).click();
  const styleRow = await step(1);
  await expectEvidence([page], { ...scenario, evidence: [lockedCountLine!] });
  const sceneHeading = styleRow
    .locator("div")
    .filter({ hasText: /^Scene Heading/ })
    .first();
  const spaceBefore = sceneHeading.getByLabel("Space before");
  await spaceBefore.fill("2");
  await spaceBefore.press("Enter");
  await page
    .getByRole("button", { name: /Back|205/ })
    .first()
    .click();
  await selectTourStep(page, scenario.promise, 2);
  await page.getByRole("heading", { level: 1 }).getByRole("button").click();
  await (await step(2)).click();
  await expectEvidence([page], { ...scenario, evidence: [inheritedRow!] });
});
