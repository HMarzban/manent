// The Tour's production-lock-copy scenario: Priya tries Lock on a copy of 203 first and opens the copy beside the original.
import { seedDoc } from "@manent/demo";
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

// a fresh seed comes first
test.describe.configure({ timeout: 180_000 });

tourScenario("production-lock-copy", async ({ page, scenario, step }) => {
  await selectTourStep(page, scenario.promise, 0);
  await page
    .getByRole("button", {
      name: DOCUMENT_WORDS.titleMenu(
        seedDoc("medium/harbour-lights/203").title,
      ),
    })
    .click();
  await (await step(0)).click();
  await (await step(1)).click();
  await expectEvidence([page], scenario);
  await expect(page.locator("[data-tour='state_bar']")).not.toContainText(
    "revision",
  );
  await (await step(2)).click();
  await expect(page.locator("[data-tour='beside']")).toBeVisible();
});
