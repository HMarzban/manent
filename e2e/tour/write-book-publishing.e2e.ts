// Tour scenario E2E: Book Publishing (Engine 3 serif layout, Footnotes inspector, facing spreads, EPUB & Markdown export).
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

test.use({ viewport: { width: 1600, height: 900 } });

tourScenario("write-book-publishing", async ({ page, scenario }) => {
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );

  // 1. Switch Book layout on in Page layout popover for Source Serif 4 + 6x9 + mirrored margins.
  const toolbar = page.getByRole("toolbar", { name: "Book format" });
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole("button", { name: "Page layout" }).click();
  const bookLayoutSwitch = page.getByRole("switch", { name: "Book layout" });
  if ((await bookLayoutSwitch.getAttribute("aria-checked")) !== "true") {
    await bookLayoutSwitch.click();
  }
  await expect(
    page.locator('.mn-pages[data-typography="book_serif"]'),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // 2. Open Details -> Book -> Footnotes and verify the seeded footnote is listed.
  await page
    .getByRole("button", { name: DOCUMENT_WORDS.viewMenu, exact: true })
    .click();
  const sidePanelItem = page.getByRole("menuitemcheckbox", {
    name: /Side panel/i,
  });
  if ((await sidePanelItem.getAttribute("aria-checked")) !== "true") {
    await sidePanelItem.click();
  }
  await page.keyboard.press("Escape");
  await page.locator("[data-tour='tab:details']").click();
  const footnotes = page.locator("[data-tour='details:footnotes']");
  await expect(footnotes).toBeVisible();
  await footnotes.getByRole("button", { name: /Footnotes/ }).click();
  await expect(footnotes).toContainText("Harbour Pilots' Ledger");

  // 3. Open Export via the title menu -> verify facing Spreads + EPUB + Markdown options.
  await page
    .getByRole("button", {
      name: DOCUMENT_WORDS.titleMenu("The Salt Almanac"),
    })
    .click();
  await page.getByRole("menuitem", { name: /Export/ }).click();
  await expect(page.locator("[data-tour='send:as']")).toBeVisible();
  await expect(page.locator("[data-view='spread']")).toBeVisible();
  await expectEvidence([page], scenario);
});
