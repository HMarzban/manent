// The Tour's together-suggest scenario: Sam switches to As suggestions in 205, edits scene 9, and Dana accepts it.
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { pressKeyOf } from "../support/interface.ts";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("together-suggest", async ({ windows, scenario, step }) => {
  const [sam, dana] = windows as [Page, Page];
  const [suggestBar, toReviewItem, usedMsg] = scenario.evidence;
  await expect(dana.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await selectTourStep(sam, scenario.promise, 0);
  await sam.getByRole("button", { name: /Dana Reyes/i }).click();
  await (await step(0)).hover();
  await sam
    .getByRole("menuitemradio", { name: /As suggestions/i })
    .or(sam.getByRole("menuitem", { name: /As suggestions/i }))
    .first()
    .click();
  await expectEvidence([sam], { ...scenario, evidence: [suggestBar!] });
  await sam.keyboard.press("Escape");
  await sam.keyboard.press("Escape");
  const samsPage = await step(1);
  const dialogue = samsPage
    .locator("[data-type='scene_heading']")
    .nth(8)
    .locator("xpath=following::*[@data-type='dialogue'][1]");
  await dialogue.scrollIntoViewIfNeeded();
  await dialogue.click({ position: { x: 4, y: 4 } });
  await settled(sam);
  await sam.keyboard.type("Steady now. ");
  await pressKeyOf(dana, "history.open");
  const toReview = await step(2);
  await expectEvidence([dana], { ...scenario, evidence: [toReviewItem!] });
  await toReview
    .getByRole("button", { name: "Use this", exact: true })
    .first()
    .click();
  await expectEvidence([dana], { ...scenario, evidence: [usedMsg!] });
});
