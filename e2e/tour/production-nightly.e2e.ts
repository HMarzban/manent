// The Tour's production-nightly scenario: Dana opens Send draft on 305 and sees Full draft marked against Network run-through draft.
import { seedDoc } from "@manent/demo";
import { DOCUMENT_WORDS, DRAFTS_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  signedInAs,
  tourScenario,
} from "../support/tour.ts";

// Lanternfield Studios is seeded in the background: wait up to 10 minutes for its switcher line to lose "getting ready"
const HEAVY_READY_MS = 600_000;

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(HEAVY_READY_MS + 60_000);
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await signedInAs(page, "dana", "/");
    await page.locator('[data-tour="workspace_switcher"]').click();
    const lanternfield = page
      .getByRole("menuitem")
      .filter({ hasText: "Lanternfield Studios" });
    await expect(lanternfield).toBeVisible();
    await expect(lanternfield).not.toContainText("getting ready", {
      timeout: HEAVY_READY_MS,
    });
  } finally {
    await context.close();
  }
});

tourScenario("production-nightly", async ({ page, scenario, step }) => {
  await selectTourStep(page, scenario.promise, 0);
  await page
    .getByRole("button", {
      name: DOCUMENT_WORDS.titleMenu(seedDoc("heavy/h25/305").title),
    })
    .click();
  await (await step(0)).click();
  const whatRow = await step(1);
  await expect(whatRow).toContainText(DRAFTS_WORDS.fullDraft);
  await expect(whatRow).toContainText(
    DRAFTS_WORDS.markedAgainstLastSent("Network run-through draft"),
  );
  await expectEvidence([page], scenario);
});
