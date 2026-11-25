// The Tour's write-ink-play scenario: playing The Keeper's Logbook Beside and watching live recompile replay edits.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("write-ink-play", async ({ page, scenario, step }) => {
  const [place, upToDate, varsToggle, fiveHours] = scenario.evidence;
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await selectTourStep(page, scenario.promise, 0);
  await page
    .getByRole("button", {
      name: DOCUMENT_WORDS.titleMenu("The Keeper's Logbook"),
    })
    .click();
  await (await step(0)).click();

  const player = page.locator("[data-tour='ink:player']");
  await expect(player).toBeVisible();
  const choices = page.locator("[data-tour='ink:choices']");
  await expect(choices).toBeVisible();

  await page.keyboard.press("1");
  await expect(choices).toContainText("Read the last entry");
  await page.keyboard.press("1");

  await expect(player).toContainText(place!);
  await expect(player).toContainText(upToDate!);
  await expect(player).toContainText(varsToggle!);

  const varsBtn = player.getByRole("button", { name: varsToggle! });
  await varsBtn.click();
  await expect(player.getByLabel("trust")).toHaveValue("1");
  await expect(page.locator(".mn-ink-mark-visited").first()).toBeVisible();

  // Edit "Four hours" -> "Five hours" on line 24 in the source editor
  const line24 = page
    .locator("[data-tour='page'] .ProseMirror")
    .getByText("Four hours of turning a handle")
    .first();
  await line24.scrollIntoViewIfNeeded();
  await line24.evaluate((node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      const offset = textNode.data.indexOf("Four");
      if (offset !== -1) {
        const range = document.createRange();
        range.setStart(textNode, offset);
        range.setEnd(textNode, offset + 4);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        break;
      }
    }
  });
  await page.keyboard.type("Five");

  await expect(player).toContainText(fiveHours!, { timeout: 10_000 });
  await expect(player).toContainText(upToDate!, { timeout: 10_000 });
  await expectEvidence([page], scenario);

  // Restore seeded line 24 because this scenario shares the seed (fresh: false)
  await page
    .locator("[data-tour='page'] .ProseMirror")
    .getByText("Five hours of turning a handle")
    .first()
    .click();
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.locator("[data-tour='page']")).toContainText(
      "Four hours of turning a handle",
      { timeout: 1000 },
    );
  }).toPass();
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
});
