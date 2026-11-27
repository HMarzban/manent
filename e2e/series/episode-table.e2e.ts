// Dana views Harbour Lights' seasons and episode table, and naming a draft moves an episode's stage.
import { docPath } from "@manent/demo";
import { DOCUMENT_WORDS, HISTORY_WORDS, SERIES_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import { EDITABLE } from "../editor/support.ts";
import { labelOf } from "../support/interface.ts";
import { reseedDemo, signedInAs } from "../support/tour.ts";

const TIMEOUT_MS = 180_000;

test("Dana sees Harbour Lights' seasons and episode table, and naming a draft moves its stage", async ({
  page,
  request,
}) => {
  test.setTimeout(TIMEOUT_MS);
  await reseedDemo(request);
  try {
    await signedInAs(page, "dana", "/?panels=closed");

    const heading = SERIES_WORDS.seasonHeading("Harbour Lights", 2);
    const section = page.locator(`section[aria-label="${heading}"]`);
    await expect(section).toBeVisible();

    const table = section.locator("[data-tour='episode_table']");
    await expect(table).toBeVisible();
    for (const column of Object.values(SERIES_WORDS.columns)) {
      await expect(table.locator(".mn-table-head")).toContainText(column);
    }

    const rowOf = (ep: string) =>
      table.getByRole("listitem").filter({ hasText: ep }).first();

    await expect(rowOf("Low Tide")).toContainText("Sam Okafor");
    await expect(rowOf("Low Tide")).toContainText("Blue");
    await expect(rowOf("Low Tide")).toContainText("58");

    await expect(rowOf("Salt")).toContainText("Dana Reyes");
    await expect(rowOf("Salt")).toContainText("White");
    await expect(rowOf("Salt")).toContainText("56");

    await expect(rowOf("Undertow")).toContainText("Dana Reyes");
    await expect(rowOf("Undertow")).toContainText("Network · 4 open");
    await expect(rowOf("Undertow")).toContainText("61");
    await expect(rowOf("Undertow")).toContainText("▲3");

    await expect(rowOf("The Ferry")).toContainText("Sam Okafor");
    await expect(rowOf("The Ferry")).toContainText("Studio");
    await expect(rowOf("The Ferry")).toContainText("52");

    await expect(rowOf("Slack Water")).toContainText("Sam Okafor");
    await expect(rowOf("Slack Water")).toContainText("Writer's First");
    await expect(rowOf("Slack Water")).toContainText("31");

    await expect(rowOf("The Bar")).toContainText("Dana Reyes");
    await expect(rowOf("The Bar")).toContainText("Outline");

    // Open 205 Slack Water and name a draft on Harbour Lights' ladder to advance its stage
    await page.goto(`${docPath("medium/harbour-lights/205")}?panels=closed`);
    await expect(page.locator(EDITABLE)).toBeVisible();
    await expect(page.locator("[data-tour='status:server']")).toHaveText(
      "Synced",
    );
    await page.getByRole("heading", { level: 1 }).getByRole("button").click();
    await page
      .getByRole("menuitem", { name: labelOf("history.nameDraft") })
      .click();
    const field = page.getByRole("textbox", { name: HISTORY_WORDS.nameField });
    await expect(field).toBeVisible();
    await field.fill("Studio");
    await field.press("Enter");
    await expect(page.locator("[data-tour='history_list']")).toContainText(
      "Studio",
    );

    // Return from History -> script -> Library and verify 205's stage moved to Studio
    await page
      .getByRole("button", { name: HISTORY_WORDS.backToScript })
      .click();
    await expect(page.locator(EDITABLE)).toBeVisible();
    await page.getByRole("button", { name: DOCUMENT_WORDS.back }).click();
    await page.waitForURL((at) => at.pathname === "/");
    const updatedTable = page
      .locator(`section[aria-label="${heading}"]`)
      .locator("[data-tour='episode_table']");
    await expect(
      updatedTable
        .getByRole("listitem")
        .filter({ hasText: "Slack Water" })
        .first(),
    ).toContainText("Studio");
  } finally {
    await reseedDemo(request);
  }
});
