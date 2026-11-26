import { expect } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("history-every-version", async ({ page, scenario, step }) => {
  await (await step(0)).click();
  const list = await step(1);
  // the oldest draft is at the foot of the list
  await expect(list.getByText("First draft").first()).toBeVisible();
  await expectEvidence([page], scenario);
});
