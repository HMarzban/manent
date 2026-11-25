// The Tour's desktop-first-script scenario: a script started in the desktop app is on this device only until its
// writer signs in to sync.
import { test } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

// it starts from a new seed, which takes the demo some 20 seconds to make
test.describe.configure({ timeout: 120_000 });

tourScenario("desktop-first-script", async ({ page, scenario, step }) => {
  const [deviceOnly, synced] = scenario.evidence;
  await (await step(0)).locator("[data-type='scene_heading']").first().click();
  await settled(page);
  await page.keyboard.type("INT. FERRY TERMINAL - NIGHT");
  await expectEvidence([page], { ...scenario, evidence: [deviceOnly!] });
  await page.locator("[data-tour='status:server']").click();
  await (await step(1)).click();
  await expectEvidence([page], { ...scenario, evidence: [synced!] });
});
