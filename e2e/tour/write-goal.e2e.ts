// The Tour's write-goal scenario: setting a daily 2-page goal and running/ending a 10-minute sprint.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("write-goal", async ({ page, scenario, step }) => {
  const [yoursCopy, readoutCopy, endedCopy] = scenario.evidence;
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await selectTourStep(page, scenario.promise, 0);
  await page.locator("[data-tour='app.palette']").click();
  await page.getByRole("option", { name: "Script", exact: true }).click();
  await page.getByRole("option", { name: /^Goal$/ }).click();

  const side = page.locator("[data-region='side_panel']");
  await expect(side).toContainText(yoursCopy!);
  await expectEvidence([page], { ...scenario, evidence: [yoursCopy!] });

  const goalInput = side.getByRole("spinbutton", { name: "Goal" });
  await goalInput.fill("2");
  await goalInput.press("Enter");

  const goalReadout = page.locator("[data-tour='status:goal']");
  await expect(goalReadout).toContainText(readoutCopy!);
  await expectEvidence([page], { ...scenario, evidence: [readoutCopy!] });

  // Start a 10-minute sprint from Goal section
  await side.getByRole("button", { name: "Start sprint" }).click();
  await page.getByRole("option", { name: "10 minutes", exact: true }).click();
  const stateBar = page.locator("[data-tour='state_bar']");
  await expect(stateBar).toContainText("Sprint");

  // Reopen Tour tab to highlight step 3 (sprint.end in state bar) and end sprint
  await side.getByRole("tab", { name: DOCUMENT_WORDS.tourTab }).click();
  await (await step(3)).click();
  await expect(page.locator("[data-tour='message_slot']")).toContainText(
    endedCopy!,
  );
  await expectEvidence([page], { ...scenario, evidence: [endedCopy!] });

  // Clear Sam's private goal so later non-fresh scenarios start tidy
  await side.getByRole("tab", { name: "Details" }).click();
  const removeBtn = side.getByRole("button", { name: "Remove" });
  if (await removeBtn.isVisible()) await removeBtn.click();
});
