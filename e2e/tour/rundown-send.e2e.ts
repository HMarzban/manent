// The Tour's rundown-send scenario: story 01 reads Changed inside the air window, and Send puts the corrected count on prompter.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("rundown-send", async ({ page, scenario, step }) => {
  const [changed, airWindow, onPrompter, correctedCount] = scenario.evidence;

  await step(0);
  const storyCell = page
    .locator('[role="gridcell"][data-col-id="story"]')
    .filter({ hasText: "Tolle Exchange library: council votes yes" })
    .first();
  await expect(storyCell).toBeVisible();
  const rowId = await storyCell.getAttribute("data-row-id");
  expect(rowId).not.toBeNull();

  const prompterCell = page.locator(
    `[role="gridcell"][data-row-id="${rowId!}"][data-col-id="prompter"]`,
  );
  await expect(prompterCell).toContainText(changed!);

  const stateBar = await step(1);
  await expect(stateBar).toContainText(airWindow!);
  await expectEvidence([page], {
    ...scenario,
    evidence: [changed!, airWindow!],
  });

  await (await step(2)).click();
  await expect(prompterCell).toContainText(onPrompter!);
  await expectEvidence([page], { ...scenario, evidence: [onPrompter!] });

  await selectTourStep(page, scenario.promise, 3);
  await page
    .getByRole("button", { name: DOCUMENT_WORDS.viewMenu, exact: true })
    .click();
  const prompterPopup = page.waitForEvent("popup");
  await (await step(3)).click();
  const prompter = await prompterPopup;

  try {
    await expectEvidence([prompter], {
      ...scenario,
      evidence: [correctedCount!],
    });
  } finally {
    await prompter.close();
  }
});
