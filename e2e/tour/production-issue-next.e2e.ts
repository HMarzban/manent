import { expect, test } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

// a fresh seed comes first
test.describe.configure({ timeout: 180_000 });

tourScenario("production-issue-next", async ({ page, scenario, step }) => {
  await (await step(0)).click();
  const confirm = await step(1);
  await expectEvidence([page], scenario);
  await confirm.click();
  await expect(page).toHaveURL((at) => !at.pathname.endsWith("/send/issue"));
});
