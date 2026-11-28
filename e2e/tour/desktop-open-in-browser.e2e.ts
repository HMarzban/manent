// The Tour's desktop-open-in-browser scenario: a second person opens the desktop app's server in a browser, and both
// write in one script.
import { expect } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { E2E_PORT } from "../support/ports.ts";
import {
  expectEvidence,
  selectTourStep,
  signedInAs,
  tourScenario,
} from "../support/tour.ts";

tourScenario("desktop-open-in-browser", async ({ page, scenario, step }) => {
  await selectTourStep(page, scenario.promise, 0);
  await page.locator("[data-tour='app.palette']").click();
  await page.getByRole("option", { name: "File", exact: true }).click();
  await step(0);
  await page.keyboard.press("Escape");
  // the shell would open the embedded server's address in the browser; under the headless node a context of its own
  // opens it, and Priya is chosen there
  const browser = page.context().browser()!;
  const context = await browser.newContext({
    baseURL: `http://localhost:${E2E_PORT}`,
  });
  try {
    const priya = await context.newPage();
    await signedInAs(priya, "priya", scenario.setup.open);
    const action = (await step(1)).locator("[data-type='action']").first();
    await action.click({ position: { x: 1, y: 1 } });
    await settled(page);
    await page.keyboard.type("The ramp comes down. ");
    const priyaAction = priya
      .locator("[data-tour='page'] [data-type='action']")
      .first();
    await priyaAction.click({ position: { x: 1, y: 1 } });
    await settled(priya);
    await priya.keyboard.type("Engines idle. ");
    await expectEvidence([page], scenario);
    await expectEvidence([priya], scenario);
    await expect(action).toContainText("Engines idle.");
    await expect(priyaAction).toContainText("The ramp comes down.");
  } finally {
    await context.close();
  }
});
