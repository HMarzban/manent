import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

const RESTORED = "No. Play me a C. The top one.";

/** Scene 14's heading, the fourteenth of the script. */
const sceneHeading = (page: Page): Locator =>
  page.locator("[data-region='page'] [data-type='scene_heading']").nth(13);

tourScenario("history-restore-scene", async ({ page, scenario, step }) => {
  // set up, perform and check; then set up again, and the scene can be restored once more
  for (const round of [1, 2]) {
    if (round === 2) {
      // as the scenario's person, as Set it up asks
      const signIn = await page.request.post("/api/sign-in", {
        data: { userId: scenario.setup.userId },
      });
      const token: unknown = Reflect.get(Object(await signIn.json()), "token");
      const prepared = await page.request.post("/api/demo/tour/prepare", {
        data: { scenarioId: scenario.id },
        headers: { Authorization: `Bearer ${String(token)}` },
      });
      expect(await prepared.json()).toEqual({ ok: true });
      // the preparation brought scene 14 back from the second draft, which this window shows as it arrives
      await expect(
        page.locator("[data-region='page']").getByText(RESTORED),
      ).toHaveCount(0);
      await page
        .locator("[data-region='side_panel']")
        .getByRole("tab", { name: DOCUMENT_WORDS.tourTab })
        .click();
    }
    await (await step(0)).click();
    await sceneHeading(page).click();
    await selectTourStep(page, scenario.promise, 1);
    await page
      .getByRole("button", { name: "First draft — row menu", exact: true })
      .click();
    await (await step(1)).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Restore scene 14", exact: true })
      .click();
    await expectEvidence([page], scenario);
  }
});
