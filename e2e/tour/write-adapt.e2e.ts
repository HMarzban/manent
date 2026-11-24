// The Tour's write-adapt scenario: opening Jumpox beside the play and turning Beside to chapter 6 at scene 4.
import { settled } from "../editor/support.ts";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("write-adapt", async ({ page, scenario, step }) => {
  await selectTourStep(page, scenario.promise, 0);
  await page.getByRole("heading", { level: 1 }).getByRole("button").click();
  await (await step(0)).click();
  await page
    .getByRole("option", { name: /Jumpox — Spark & Looki/ })
    .first()
    .click();
  const sheet = await step(1);
  const scene4 = sheet
    .locator("[data-type='scene_heading']", {
      hasText: "Mrs. Lomax's Spectacles",
    })
    .first();
  await scene4.scrollIntoViewIfNeeded();
  await scene4.click();
  await settled(page);
  await step(2);
  await expectEvidence([page], scenario);
});
