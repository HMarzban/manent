import { seedDoc } from "@manent/demo";
import { test } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

// a fresh seed comes first
test.describe.configure({ timeout: 180_000 });

tourScenario("production-lock", async ({ page, scenario, step }) => {
  const titleButton = page
    .locator('[data-region="title_bar"]')
    .getByRole("button", { name: seedDoc("medium/harbour-lights/203").title });
  await titleButton.click();
  await step(0);
  await page.keyboard.press("Escape");
  await selectTourStep(page, scenario.promise, 1);
  await titleButton.click();
  await page.locator('[data-tour="production.lock"]').click();
  await (await step(1)).click();
  await expectEvidence([page], scenario);
});
