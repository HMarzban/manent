import { seedDoc } from "@manent/demo";
import { test } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

// a fresh seed comes first
test.describe.configure({ timeout: 180_000 });

tourScenario("production-lock", async ({ page, scenario, step }) => {
  await page
    .locator('[data-region="title_bar"]')
    .getByRole("button", { name: seedDoc("medium/harbour-lights/203").title })
    .click();
  await (await step(0)).click();
  await (await step(1)).click();
  await expectEvidence([page], scenario);
});
