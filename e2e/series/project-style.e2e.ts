// Dana changes Character Capitals in Project settings, and unlocked episodes follow at once while locked ones keep theirs.
import { docPath, seedDoc, seedProject } from "@manent/demo";
import { DOCUMENT_WORDS, PROJECT_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { EDITABLE } from "../editor/support.ts";
import { signedInAs } from "../support/tour.ts";

const TIMEOUT_MS = 120_000;

/** Computed CSS `text-transform` of the first Character cue on `page`. */
async function characterTextTransform(page: Page): Promise<string> {
  const cue = page
    .locator("[data-tour='page'] [data-type='character']")
    .first();
  await expect(cue).toBeVisible();
  return cue.evaluate((el) => getComputedStyle(el).textTransform);
}

/** Opens Project settings for Harbour Lights and selects `choice` for Character Capitals. */
async function setCharacterCapitals(page: Page, choice: string): Promise<void> {
  const styleRow = page.locator("[data-tour='setting:project.style']");
  const characterRow = styleRow
    .locator("div.py-3")
    .filter({
      has: page.locator("span.font-medium", { hasText: /^Character$/ }),
    })
    .first();
  await expect(characterRow).toBeVisible();
  await characterRow.getByLabel(PROJECT_WORDS.styleFields.capitals).click();
  await page.getByRole("option", { name: choice, exact: true }).click();
}

test("changing Character Capitals in Project settings updates every unlocked episode at once", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(TIMEOUT_MS);
  const projectId = seedProject("medium/harbour-lights").projectId;
  const secondContext = await browser.newContext({ baseURL });
  const otherUnlocked = await secondContext.newPage();

  try {
    // Open two unlocked episodes (205 and 204) simultaneously
    await signedInAs(
      page,
      "dana",
      `${docPath("medium/harbour-lights/205")}?panels=closed`,
    );
    await expect(page.locator(EDITABLE)).toBeVisible();
    await expect(page.locator("[data-tour='status:server']")).toHaveText(
      "Synced",
    );

    await signedInAs(
      otherUnlocked,
      "dana",
      `${docPath("medium/harbour-lights/204")}?panels=closed`,
    );
    await expect(otherUnlocked.locator(EDITABLE)).toBeVisible();
    await expect(
      otherUnlocked.locator("[data-tour='status:server']"),
    ).toHaveText("Synced");

    // Open Project settings from 205's title menu
    await page
      .getByRole("button", {
        name: DOCUMENT_WORDS.titleMenu(
          seedDoc("medium/harbour-lights/205").title,
        ),
      })
      .click();
    await page.locator("[data-tour='project.openSettings']").click();
    await expect(
      page.getByText(
        "Shared by every episode of Harbour Lights whose page numbers are not locked.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        "2 of 6 episodes have their page numbers locked and keep the style they were locked with.",
      ),
    ).toBeVisible();

    // Set Character Capitals to Off: unlocked episode 204 updates live
    await setCharacterCapitals(page, PROJECT_WORDS.styleCapitals.off);
    await expect(page.locator("[data-tour='message_slot']")).toContainText(
      PROJECT_WORDS.ownStyleChanged("Character", null),
    );
    await expect.poll(() => characterTextTransform(otherUnlocked)).toBe("none");

    // Set Character Capitals to On: unlocked episodes 204 and 205 both follow at once
    await setCharacterCapitals(page, PROJECT_WORDS.styleCapitals.on);
    await expect
      .poll(() => characterTextTransform(otherUnlocked))
      .toBe("uppercase");

    // Return to 205 and verify its Script settings shows inheritance from Harbour Lights
    await page.goto(`${docPath("medium/harbour-lights/205")}?panels=closed`);
    await expect(page.locator(EDITABLE)).toBeVisible();
    await expect.poll(() => characterTextTransform(page)).toBe("uppercase");
    await page
      .getByRole("button", {
        name: DOCUMENT_WORDS.titleMenu(
          seedDoc("medium/harbour-lights/205").title,
        ),
      })
      .click();
    await page.locator("[data-tour='doc.scriptSettings']").click();
    await expect(
      page.getByText("From Harbour Lights' project settings").first(),
    ).toBeVisible();
    await expect(
      page.locator("[data-tour='setting:script.style']"),
    ).toContainText("Character");

    // Verify locked episode 201 keeps its frozen style instead of inheriting live
    await page.goto(`${docPath("medium/harbour-lights/201")}?panels=closed`);
    await expect(page.locator(EDITABLE)).toBeVisible();
    await expect.poll(() => characterTextTransform(page)).toBe("uppercase");
    await page
      .getByRole("button", {
        name: DOCUMENT_WORDS.titleMenu(
          seedDoc("medium/harbour-lights/201").title,
        ),
      })
      .click();
    await page.locator("[data-tour='doc.scriptSettings']").click();
    await expect(
      page.getByText("From Harbour Lights' project settings"),
    ).toHaveCount(0);
    await expect(
      page.getByText(/Frozen when page numbers were locked/).first(),
    ).toBeVisible();
  } finally {
    // Reset Character style in Project settings so later tests see the clean seed
    await page.goto(`/p/${projectId}/settings?from=%2F`);
    const styleRow = page.locator("[data-tour='setting:project.style']");
    const characterRow = styleRow
      .locator("div.py-3")
      .filter({
        has: page.locator("span.font-medium", { hasText: /^Character$/ }),
      })
      .first();
    const reset = characterRow.getByRole("button", {
      name: PROJECT_WORDS.styleReset,
      exact: true,
    });
    if (await reset.isVisible().catch(() => false)) {
      await reset.click();
      await expect(reset).toHaveCount(0);
    }
    await secondContext.close();
  }
});
