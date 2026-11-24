// The Tour's together-private scenario: Sam sees his private writing state bar and hands in his 6 changed scenes.
import { expect } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("together-private", async ({ page, scenario, step }) => {
  const [privateBar, handInButton, toReviewMsg, beforeHandIn] =
    scenario.evidence;
  await step(0);
  await expectEvidence([page], { ...scenario, evidence: [privateBar!] });
  await (await step(1)).click();
  const side = page.locator("[data-region='side_panel']");
  await side.getByRole("button", { name: "Hand in", exact: true }).click();
  const confirm = await step(2);
  await expect(confirm).toContainText(handInButton!);
  await confirm.click();
  await expectEvidence([page], {
    ...scenario,
    evidence: [toReviewMsg!, beforeHandIn!],
  });
});
