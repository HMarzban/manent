import { LIBRARY_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { settled } from "../editor/support.ts";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

/** Clicks just right of a line's last word, which puts the caret at its end. */
async function clickAtEnd(line: Locator): Promise<void> {
  const box = await line.boundingBox();
  if (box === null) throw new Error("the line is not drawn");
  await line.click({ position: { x: box.width - 2, y: box.height - 3 } });
}

// it starts from a new seed, which takes most of a minute
test.describe.configure({ timeout: 180_000 });

tourScenario("write-first-run", async ({ page, scenario, step }) => {
  const [unsynced, synced] = scenario.evidence;
  // the Library's Continue lists the script the first launch opened
  await page
    .locator(`section[aria-label="${LIBRARY_WORDS.continueHeading}"] .mn-row`)
    .first()
    .click();
  const sheet = await step(0);
  await clickAtEnd(sheet.locator("[data-type]").last());
  await settled(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("INT. KITCHEN - NIGHT");
  await step(1);
  await expect(page.getByRole("button", { name: unsynced })).toBeVisible();
  await selectTourStep(page, scenario.promise, 2);
  await page.getByRole("button", { name: unsynced }).click();
  await (await step(2)).click();
  await expectEvidence([page], { ...scenario, evidence: [synced!] });
});
