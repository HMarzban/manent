// The Tour's write-names scenario: a near match to a project name is underlined with dots and replaced by Enter.
import { expect } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("write-names", async ({ page, scenario, step }) => {
  const [listed] = scenario.evidence;
  const sheet = await step(0);
  const misspelling = sheet
    .locator(".mn-name-match", { hasText: "Marguerita" })
    .first();
  await misspelling.scrollIntoViewIfNeeded();
  await expect(misspelling).toBeVisible();
  await expect(misspelling).toHaveAttribute(
    "aria-description",
    'Nearly matches "Marguerite" in the project\'s names',
  );
  await step(1);
  await misspelling.click();
  await settled(page);
  await expectEvidence([page], scenario);
  await step(2);
  await misspelling.click();
  await settled(page);
  await page.keyboard.press("Enter");
  await expect(
    sheet.locator("[data-type='action']", { hasText: "Down on the slip" }),
  ).toContainText(listed!);
});
