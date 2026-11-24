// The Tour's together-present scenario: Dana presents 205 to the room, Sam pitches a line in scene 6, and Dana sees it marked Pitched.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

/** Selects step `index` in the Tour before opening a menu or popover whose blur would otherwise dismiss it. */
async function selectTourStep(
  page: Page,
  promise: string,
  index: number,
): Promise<void> {
  const row = page
    .locator("[data-region='side_panel']")
    .getByRole("tabpanel", { name: DOCUMENT_WORDS.tourTab })
    .getByRole("listitem")
    .filter({ hasText: promise })
    .locator("ol > li > div")
    .nth(index);
  await row.click();
  await expect(row).toHaveAttribute("aria-current", "true");
}

tourScenario("together-present", async ({ windows, scenario, step }) => {
  const [dana, sam] = windows as [Page, Page];
  const [driving, marker, pitched] = scenario.evidence;
  await expect(sam.locator("[data-tour='status:server']")).toHaveText("Synced");
  await selectTourStep(dana, scenario.promise, 0);
  await dana.getByRole("button", { name: DOCUMENT_WORDS.viewMenu }).click();
  await (await step(0)).click();
  await expectEvidence([sam], { ...scenario, evidence: [driving!] });
  const danasPage = await step(1);
  const idaSpeechId = await danasPage.evaluate((root) => {
    const heading = root.querySelectorAll("[data-type='scene_heading']")[5];
    for (let at = heading?.nextElementSibling; at; at = at.nextElementSibling) {
      if (at.getAttribute("data-type") === "scene_heading") break;
      if (
        at.getAttribute("data-type") === "character" &&
        at.textContent?.trim() === "IDA"
      )
        return at.nextElementSibling?.getAttribute("data-id") ?? null;
    }
    return null;
  });
  const idaSpeech = danasPage.locator(`[data-id="${idaSpeechId}"]`);
  await idaSpeech.scrollIntoViewIfNeeded();
  await idaSpeech.click();
  await settled(dana);
  const samsBar = await step(2);
  await samsBar.getByRole("button", { name: "Pitch", exact: true }).click();
  const pitchInput = sam.getByLabel("Pitch a line");
  await pitchInput.fill("Keep him in the wheelhouse until the mainland calls.");
  await pitchInput.press("Enter");
  await expectEvidence([dana], { ...scenario, evidence: [marker!] });
  await selectTourStep(dana, scenario.promise, 3);
  await dana
    .getByRole("button", { name: /Alternates/i })
    .first()
    .click();
  await step(3);
  await expectEvidence([dana], { ...scenario, evidence: [pitched!] });
});
