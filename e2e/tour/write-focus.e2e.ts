// The Tour's write-focus scenario: hiding both panels in Focus mode while status stays visible, then restoring panels.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("write-focus", async ({ page, scenario, step }) => {
  const [savedSynced, scenesLabel] = scenario.evidence;
  // Widen viewport so left (Scenes) and side (Tour) panels fit beside the page simultaneously
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  // Ensure the left Scenes panel is open before entering Focus mode so toggling off brings Scenes back
  const leftPanel = page.locator("[data-region='left_panel']");
  if (!(await leftPanel.isVisible())) {
    await page.getByRole("button", { name: DOCUMENT_WORDS.viewMenu }).click();
    await page.locator("[data-tour='view.leftPanel']").click();
    await page.keyboard.press("Escape");
    await expect(leftPanel).toBeVisible();
  }

  await selectTourStep(page, scenario.promise, 0);
  await page.getByRole("button", { name: DOCUMENT_WORDS.viewMenu }).click();
  await (await step(0)).click();
  await page.keyboard.press("Escape");

  // Both panels close while Saved · Synced remains visible beside the title
  await expect(leftPanel).toBeHidden();
  await expect(page.locator("[data-region='side_panel']")).toBeHidden();
  await expect(
    page.getByRole("button", { name: savedSynced!, exact: true }),
  ).toBeVisible();

  // Choose Focus mode again: both panels return as they were, including Scenes
  await page.getByRole("button", { name: DOCUMENT_WORDS.viewMenu }).click();
  await page.locator("[data-tour='view.focusMode']").click();
  await page.keyboard.press("Escape");
  await expect(leftPanel).toBeVisible();
  await expect(leftPanel).toContainText(scenesLabel!);
  await expect(
    page.getByRole("button", { name: savedSynced!, exact: true }),
  ).toBeVisible();
  await expectEvidence([page], { ...scenario, evidence: [scenesLabel!] });
});
