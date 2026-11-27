import { DEMO_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("together-add-writers", async ({ page, scenario, step }) => {
  const sheet = page.locator("[data-tour='page']");
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  // the line after scene 2's heading
  const ownScene = sheet
    .locator("[data-type='scene_heading']")
    .nth(1)
    .locator("xpath=following-sibling::p[1]");
  await ownScene.click();
  await settled(page);
  if (
    !(await page
      .locator("[data-tour='demo:writers']")
      .isVisible()
      .catch(() => false))
  ) {
    await page
      .getByRole("region", { name: DEMO_WORDS.demo })
      .getByRole("button", { name: DEMO_WORDS.proofLab })
      .click();
  }
  const writers = await step(0);
  await writers
    .getByRole("group", { name: DEMO_WORDS.writersChoice })
    .getByRole("button", { name: "5", exact: true })
    .click();
  await step(1);
  await ownScene.click();
  await settled(page);
  await page.keyboard.type(
    " The radio hisses, then finds the shipping forecast.",
  );
  await (await step(2)).click();
  await expectEvidence([page], scenario);
  await page.keyboard.press("Escape");
  const stopSection = await step(3);
  await stopSection
    .getByRole("button", { name: DEMO_WORDS.stopWriters })
    .click();
  await expect(stopSection).toContainText(DEMO_WORDS.addWriters);
});
