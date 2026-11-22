// The Tour's desktop-open-in-browser scenario: a second person opens the desktop app's server in a browser, and both
// write in one script.
import { settled } from "../editor/support.ts";
import { E2E_PORT } from "../support/ports.ts";
import { expectEvidence, signedInAs, tourScenario } from "../support/tour.ts";

tourScenario("desktop-open-in-browser", async ({ page, scenario, step }) => {
  await step(0);
  // the shell would open the embedded server's address in the browser; under the headless node a context of its own
  // opens it, and Dana is chosen there
  const browser = page.context().browser()!;
  const context = await browser.newContext({
    baseURL: `http://localhost:${E2E_PORT}`,
  });
  try {
    const dana = await context.newPage();
    await signedInAs(dana, "dana", scenario.setup.open);
    const action = (await step(1)).locator("[data-type='action']").first();
    await action.click({ position: { x: 1, y: 1 } });
    await settled(page);
    await page.keyboard.type("The ramp comes down. ");
    await dana
      .locator("[data-tour='page'] [data-type='action']")
      .first()
      .click({ position: { x: 1, y: 1 } });
    await settled(dana);
    await dana.keyboard.type("Engines idle. ");
    await expectEvidence([page], scenario);
    await expectEvidence([dana], scenario);
  } finally {
    await context.close();
  }
});
