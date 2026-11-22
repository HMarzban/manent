import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("history-who-wrote", async ({ page, scenario, step }) => {
  // the scene's first line of action, which Sam wrote with it
  await (await step(0)).getByText("Shutters half down.").click();
  await page.getByRole("heading", { level: 1 }).getByRole("button").click();
  await (await step(1)).click();
  await expectEvidence([page], scenario);
});
