import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("history-who-wrote", async ({ page, scenario, step }) => {
  // the scene's first line of action, which Sam wrote with it
  await (await step(0)).getByText("Shutters half down.").click();
  await selectTourStep(page, scenario.promise, 1);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox").fill("Who wrote this?");
  await (await step(1)).click();
  await expectEvidence([page], scenario);
});
