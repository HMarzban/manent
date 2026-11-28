// The Tour's write-alternates scenario: swapping in Dana's alternate on the traffic joke and restoring a cut.
import { DOCUMENT_WORDS } from "@manent/ui";
import { test } from "@playwright/test";
import { settled } from "../editor/support.ts";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

// wide enough for the left panel beside the Tour
test.use({ viewport: { width: 1600, height: 900 } });

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
  await step(0);
  await selectTourStep(page, scenario.promise, 1);
  await joke.locator("[data-tour='alternate.show']").click();
  const popover = await step(1);
  await popover
    .locator("li", {
      hasText: "Engineers call it ambitious. Cyclists call it overdue.",
    })
    .getByRole("button", { name: "Use this" })
    .click();
  await expectEvidence([page], { ...scenario, evidence: [swapped!] });
  await selectTourStep(page, scenario.promise, 2);
  const cutsTab = page.locator("[data-tour='tab:cuts']");
  if (!(await cutsTab.isVisible())) {
    await page
      .getByRole("button", { name: DOCUMENT_WORDS.viewMenu, exact: true })
      .click();
    await page.locator("[data-tour='view.leftPanel']").click();
    // a checkbox item leaves its menu open
    await page.keyboard.press("Escape");
  }
  await (await step(2)).click();
  await page
    .locator("[data-region='left_panel']")
    .getByRole("button", { name: /Restore ".*night market/i })
    .click();
  await expectEvidence([page], { ...scenario, evidence: [restored!] });
});
