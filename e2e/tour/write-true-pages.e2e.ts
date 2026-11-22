import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

/** Clicks just right of a line's last word, which puts the caret at its end. */
async function clickAtEnd(line: Locator): Promise<void> {
  const box = await line.boundingBox();
  if (box === null) throw new Error("the line is not drawn");
  await line.click({ position: { x: box.width - 2, y: box.height - 3 } });
}

/** Undoes the typing until `after` is the line `id` again. */
async function undoUntilNext(
  page: Page,
  after: Locator,
  id: string,
): Promise<void> {
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+z");
    await expect(after).toHaveAttribute("data-id", id, { timeout: 500 });
  }).toPass();
}

tourScenario("write-true-pages", async ({ page, scenario, step }) => {
  const sheet = await step(0);
  // the script's first sync replaces what was drawn before it, and a caret placed earlier
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  const speech = sheet.locator("[data-type='dialogue']").first();
  const next = speech.locator("xpath=following-sibling::p[1]");
  const nextId = String(await next.getAttribute("data-id"));
  await clickAtEnd(speech);
  await settled(page);
  // Enter after a speech starts Action, whose empty line takes Tab for a Character
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("M");
  await expect(page.getByRole("option", { name: "MIRA" })).toBeVisible();
  await page.keyboard.press("Enter");
  await step(1);
  await page.keyboard.press("Enter");
  await page.keyboard.type("Again, slower.");
  await page.keyboard.press("Enter");
  await step(2);
  // the seeded script is shared by the Tour's other scenarios
  await undoUntilNext(page, next, nextId);
  // the undo reaches the server before the window closes
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await expectEvidence([page], scenario);
});
