import { DOCUMENT_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { pressKeyOf } from "../support/interface.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

/** Clicks just right of a line's last word, which puts the caret at its end. */
async function clickAtEnd(line: Locator): Promise<void> {
  const box = await line.boundingBox();
  if (box === null) throw new Error("the line is not drawn");
  await line.click({ position: { x: box.width - 2, y: box.height - 3 } });
}

// wide enough for the left panel beside the Tour
test.use({ viewport: { width: 1600, height: 900 } });

tourScenario("write-stage-play", async ({ page, scenario, step }) => {
  const left = page.locator("[data-region='left_panel']");
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  // the scenario starts with the left panel closed
  if (await left.isVisible()) await pressKeyOf(page, "view.leftPanel");
  await expect(left).toBeHidden();
  await page.getByRole("button", { name: DOCUMENT_WORDS.viewMenu }).click();
  await (await step(0)).click();
  // a checkbox item leaves its menu open
  await page.keyboard.press("Escape");
  await expect(left).toBeVisible();
  const sheet = await step(1);
  // the last line before the third scene's heading ends Scene 2
  const lastOfTwo = sheet
    .locator("[data-type='scene_heading']")
    .nth(2)
    .locator("xpath=preceding-sibling::p[1]");
  const nextId = String(
    await lastOfTwo
      .locator("xpath=following-sibling::p[1]")
      .getAttribute("data-id"),
  );
  await clickAtEnd(lastOfTwo);
  await settled(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("Looki climbs onto the sofa arm");
  await expectEvidence([page], scenario);
  // the seeded play is shared by the Tour's other scenarios
  const after = lastOfTwo.locator("xpath=following-sibling::p[1]");
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+z");
    await expect(after).toHaveAttribute("data-id", nextId, { timeout: 500 });
  }).toPass();
  // the undo reaches the server before the window closes
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
});
