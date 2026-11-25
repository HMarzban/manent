// The Tour's write-layout-engine scenario: updating The Lamp Room from layout engine 1 to 2 after previewing page counts.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

// a fresh seed comes first
test.describe.configure({ timeout: 180_000 });

tourScenario("write-layout-engine", async ({ page, scenario, step }) => {
  const [availableCopy, updatedCopy] = scenario.evidence;
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await selectTourStep(page, scenario.promise, 0);
  await page
    .getByRole("button", { name: DOCUMENT_WORDS.titleMenu("The Lamp Room") })
    .click();
  await (await step(0)).click();

  // Script settings opens inside the Details tab (replacing Tour in the right panel)
  const engineRow = page.locator("[data-tour='setting:script.engineVersion']");
  await expect(engineRow).toBeVisible();
  await expect(engineRow).toContainText(availableCopy!, { timeout: 15_000 });
  await expectEvidence([page], { ...scenario, evidence: [availableCopy!] });

  await engineRow.getByRole("button", { name: "Update layout engine" }).click();
  await expect(page.locator("[data-tour='message_slot']")).toContainText(
    updatedCopy!,
  );
  await expectEvidence([page], { ...scenario, evidence: [updatedCopy!] });
});
