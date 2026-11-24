// The Tour's together-present scenario: Dana presents 205 to the room, Sam pitches a line in scene 6, and Dana sees it marked Pitched.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { settled } from "../editor/support.ts";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("together-present", async ({ windows, scenario, step }) => {
  const [dana, sam] = windows as [Page, Page];
  const [driving, marker, pitched] = scenario.evidence;
  await expect(sam.locator("[data-tour='status:server']")).toHaveText("Synced");
  await selectTourStep(dana, scenario.promise, 0);
  await dana
    .getByRole("button", { name: DOCUMENT_WORDS.viewMenu, exact: true })
    .click();
  const presentPopup = dana.waitForEvent("popup");
  await (await step(0)).click();
  const present = await presentPopup;
  try {
    await expectEvidence([sam], { ...scenario, evidence: [driving!] });
    const danasPage = await step(1);
    const idaSpeechId = await danasPage.evaluate((root) => {
      const heading = root.querySelectorAll("[data-type='scene_heading']")[5];
      for (
        let at = heading?.nextElementSibling;
        at;
        at = at.nextElementSibling
      ) {
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
    await idaSpeech.click({ position: { x: 4, y: 4 } });
    await settled(dana);
    const samsBar = await step(2);
    const pitchInput = sam.locator("[data-tour='pitch_field'] input");
    await expect(async () => {
      if (!(await pitchInput.isVisible()))
        await samsBar.getByRole("button", { name: /^Pitch/ }).click();
      await expect(pitchInput).toBeVisible({ timeout: 1000 });
    }).toPass();
    await pitchInput.fill(
      "Keep him in the wheelhouse until the mainland calls.",
    );
    await pitchInput.press("Enter");
    await expectEvidence([dana], { ...scenario, evidence: [marker!] });
    await selectTourStep(dana, scenario.promise, 3);
    await dana
      .getByRole("button", { name: /Alternates, 1 of 4/ })
      .first()
      .click();
    await step(3);
    await expectEvidence([dana], { ...scenario, evidence: [pitched!] });
  } finally {
    await present.close();
  }
});
