// The Tour's together-reader scenario: Leo opens his Blue draft link and checks Changes since you last read.
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("together-reader", async ({ page, scenario, step }) => {
  await step(0);
  await (await step(1)).click();
  await step(2);
  await expectEvidence([page], scenario);
});
