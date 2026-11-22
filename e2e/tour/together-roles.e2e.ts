import { DEMO_PEOPLE } from "@manent/demo";
import { expect } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

const SAM = DEMO_PEOPLE.find((p) => p.userId === "sam")!;

tourScenario("together-roles", async ({ page, scenario, step }) => {
  const sheet = page.locator("[data-tour='page'] [contenteditable]").first();
  await sheet.click();
  await page.keyboard.type("Leo was here.");
  await step(0);
  await expectEvidence([page], scenario);
  await (await step(1)).click();
  await page.getByRole("button", { name: SAM.name }).click();
  const stateBar = page.locator("[data-tour='state_bar']");
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await expect(stateBar.getByText("Issue Pink…")).toHaveCount(0);
});
