import { expect } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { tourScenario } from "../support/tour.ts";

/** Clicks just right of a line's last word, which puts the caret at its end. */
async function clickAtEnd(line: Locator): Promise<void> {
  const box = await line.boundingBox();
  if (box === null) throw new Error("the line is not drawn");
  await line.click({ position: { x: box.width - 2, y: box.height - 3 } });
}

// more than a page holds, so the speech runs over a page's foot wherever it starts
const MORE_WORDS =
  " Then the hall goes quiet, the lamps come down, and every key on the old upright rings out one after another until the tuner lifts her hand and the room breathes again.".repeat(
    12,
  );

tourScenario("write-more-contd", async ({ page, scenario, step }) => {
  const [more, contd] = scenario.evidence;
  const sheet = await step(0);
  // the script's first sync replaces what was drawn before it, and a caret placed earlier
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  // the first speech that ends a page
  const speechId = await sheet.evaluate((root) => {
    for (const pageBreak of root.querySelectorAll(".pb:not(.pb-first)")) {
      const before = pageBreak.previousElementSibling;
      if (before?.getAttribute("data-type") === "dialogue")
        return before.getAttribute("data-id");
    }
    return null;
  });
  const speech = sheet.locator(`[data-id="${speechId}"]`);
  const text = String(await speech.textContent());
  const readout = page.locator("[data-tour='status:page']");
  const shown = String(await readout.textContent());
  // "of 99": the script's length, whichever page the caret is on
  const length = shown.slice(shown.lastIndexOf(" of "));
  await speech.scrollIntoViewIfNeeded();
  await step(1);
  await clickAtEnd(speech);
  await settled(page);
  await page.keyboard.insertText(MORE_WORDS);
  // a break's furniture is drawn by the page's styles from its data, not as text
  await expect(
    sheet.locator(`.pb-more[data-text="${more}"]`).first(),
  ).toBeVisible();
  await expect(
    sheet.locator(`.pb-contd[data-text$="${contd}"]`).first(),
  ).toBeVisible();
  // the seeded script is shared by the Tour's other scenarios
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+z");
    await expect(speech).toHaveText(text, { timeout: 500 });
  }).toPass();
  await expect(readout).toHaveText(new RegExp(`${length}$`));
  // the undo reaches the server before the window closes
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
});
