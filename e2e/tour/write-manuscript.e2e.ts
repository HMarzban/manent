import { DOCUMENT_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import { pressKeyOf } from "../support/interface.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

// wide enough for the left panel beside the Tour
test.use({ viewport: { width: 1600, height: 900 } });

tourScenario("write-manuscript", async ({ page, scenario, step }) => {
  const [, chapterOne] = scenario.evidence;
  const left = page.locator("[data-region='left_panel']");
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  // the scenario starts with the left panel closed
  if (await left.isVisible()) await pressKeyOf(page, "view.leftPanel");
  await expect(left).toBeHidden();
  await page
    .getByRole("button", { name: DOCUMENT_WORDS.viewMenu, exact: true })
    .click();
  await (await step(0)).click();
  // a checkbox item leaves its menu open
  await page.keyboard.press("Escape");
  await expect(left).toBeVisible();
  await (await step(1)).click();
  await left.getByText(chapterOne!).click();
  await expectEvidence([page], scenario);
});
