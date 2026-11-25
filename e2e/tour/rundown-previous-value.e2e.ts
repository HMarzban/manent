// The Tour's rundown-previous-value scenario: row 8's overwritten Dur holds its earlier 9:00 value and Restore puts it back.
import { RUNDOWN_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

const ROW_8_SEGMENT = "Guest one: Tessa Morland (Ida in Harbour Lights)";

tourScenario("rundown-previous-value", async ({ page, scenario, step }) => {
  const [previousHeading, wasNine, restoredMsg] = scenario.evidence;

  const cell = await step(0);
  await expect(cell).toContainText("8:30");

  const row8Menu = page.getByRole("button", {
    name: RUNDOWN_WORDS.rowHandle(ROW_8_SEGMENT),
  });
  await selectTourStep(page, scenario.promise, 1);
  await row8Menu.click();
  await (await step(1)).click();

  const popover = page.locator("[data-surface='cell_popover']");
  await expect(popover).toBeVisible();
  await expectEvidence([page], {
    ...scenario,
    evidence: [previousHeading!, wasNine!],
  });

  // selecting the next Tour step may dismiss the transient popover, so reopen it if needed
  await selectTourStep(page, scenario.promise, 2);
  if (!(await popover.isVisible())) {
    await row8Menu.click();
    await page.getByRole("menuitem", { name: "Previous value" }).click();
    await expect(popover).toBeVisible();
  }

  await (await step(2)).click();
  await expect(cell).toContainText("9:00");
  await expectEvidence([page], { ...scenario, evidence: [restoredMsg!] });
});
