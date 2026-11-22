import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("write-export", async ({ page, scenario, step }) => {
  const [exported] = scenario.evidence;
  const slot = page.locator("[data-tour='message_slot']");
  await page
    .getByRole("button", {
      name: DOCUMENT_WORDS.titleMenu("Every Key But One"),
    })
    .click();
  await (await step(0)).click();
  const download = page.waitForEvent("download");
  await (await step(1)).click();
  await download;
  // a message left from opening the script stays until it is dismissed, and the next waits behind it
  await expect(async () => {
    const dismiss = slot.getByRole("button", { name: DOCUMENT_WORDS.dismiss });
    if (await dismiss.isVisible()) await dismiss.click();
    await expect(slot).toContainText(exported!, { timeout: 1000 });
  }).toPass();
  await expectEvidence([page], scenario);
});
