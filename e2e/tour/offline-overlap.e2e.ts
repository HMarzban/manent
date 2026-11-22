// The Tour's offline-overlap scenario: a line changed by two people, one of them offline, is put to review, and the
// wording chosen there stays.
import { REVIEW_WORDS, SYNC_CENTRE_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

/** Replaces the first line of dialogue in scene 2 of `window`'s script with `text`. */
async function rewriteLine(window: Page, text: string): Promise<void> {
  await window
    .locator("[data-tour='page'] [data-type='scene_heading']")
    .nth(1)
    .locator("xpath=following::*[@data-type='dialogue'][1]")
    .click({ clickCount: 3 });
  await settled(window);
  await window.keyboard.type(text);
}

tourScenario("offline-overlap", async ({ windows, scenario, step }) => {
  const [sam, dana] = windows as [Page, Page];
  const [receipt, toReview, used] = scenario.evidence;
  await (await step(0)).getByRole("button", { name: "Offline" }).click();
  await rewriteLine(sam, "I said the morning tide, and I meant it.");
  await (await step(1)).click();
  await rewriteLine(dana, "The morning tide, Finn. Not a minute later.");
  // her wording has reached the server once her status has gone from Syncing… back to Synced
  const danaServer = dana.locator("[data-tour='status:server']");
  await expect(danaServer).toHaveText("Syncing…");
  await expect(danaServer).toHaveText(/^Synced/);
  await (await step(2)).getByRole("button", { name: "Online" }).click();
  await expectEvidence([sam], {
    ...scenario,
    evidence: [receipt!, toReview!],
  });
  await (await step(3)).click();
  await sam.getByRole("button", { name: SYNC_CENTRE_WORDS.review }).click();
  await sam
    .getByRole("button", { name: REVIEW_WORDS.useNamed(["Dana"]) })
    .click();
  await expectEvidence([sam], { ...scenario, evidence: [used!] });
});
