// Dana sees Checks at the top of Send, opens Harbour Lights' Board, and opens 205's room log Beside.
import { docPath, seedDoc } from "@manent/demo";
import {
  BOARD_WORDS,
  CHECKS_WORDS,
  DOCUMENT_WORDS,
  ROOM_LOG_TAG_WORDS,
  ROOM_LOG_WORDS,
  SERIES_WORDS,
} from "@manent/ui";
import { expect, test } from "@playwright/test";
import { EDITABLE, settled, typeLine } from "../editor/support.ts";
import { labelOf } from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";

const TIMEOUT_MS = 120_000;

test("Dana sees Checks at the top of Send, for both a clean script and a new name", async ({
  page,
}) => {
  test.setTimeout(TIMEOUT_MS);
  await signedInAs(page, "dana", "/?panels=closed");

  // Create a clean script with no check findings
  await page
    .locator('[data-region="title_bar"]')
    .getByRole("button", { name: "New script", exact: true })
    .click();
  await expect(page).toHaveURL(/\/s\//);
  await expect(page.locator(EDITABLE)).toBeFocused();
  await typeLine(page, "INT. PIER - DAY");
  await settled(page);
  await page.keyboard.press("Enter");
  await typeLine(page, "Calm water.");
  await settled(page);

  // Open Export… and verify the empty Checks sentence at the top of Send
  await page
    .getByRole("button", { name: DOCUMENT_WORDS.titleMenu("Untitled script") })
    .click();
  await page.getByRole("menuitem", { name: labelOf("doc.export") }).click();
  await expect(page.getByText(CHECKS_WORDS.nothing)).toBeVisible();

  // Go back, add a mention of Dr. Feld, and verify the Check sentence appears at the top of Send
  await page
    .getByRole("button", { name: /Untitled script/ })
    .first()
    .click();
  await expect(page.locator(EDITABLE)).toBeVisible();
  await page.locator("[data-type='action']").first().click();
  await page.keyboard.press("End");
  await typeLine(page, " The nurse says Dr. Feld is on the way.");
  await settled(page);

  await page
    .getByRole("button", { name: DOCUMENT_WORDS.titleMenu("Untitled script") })
    .click();
  await page.getByRole("menuitem", { name: labelOf("doc.export") }).click();
  await expect(
    page.getByText(`"Dr. Feld" is new and not in the project's names`),
  ).toBeVisible();
});

test("Dana opens Harbour Lights' Board and sees its storylines and cards", async ({
  page,
}) => {
  await signedInAs(page, "dana", "/?panels=closed");

  const heading = SERIES_WORDS.seasonHeading("Harbour Lights", 2);
  const section = page.locator(`section[aria-label="${heading}"]`);
  await expect(section).toBeVisible();
  await section
    .getByRole("button", { name: BOARD_WORDS.board, exact: true })
    .click();

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: BOARD_WORDS.title("Harbour Lights"),
    }),
  ).toBeVisible();
  const grid = page.locator("[data-tour='board']").first();
  await expect(grid).toBeVisible();
  await expect(grid).toContainText("A — The licence review");
  await expect(grid).toContainText("B — Cal comes home");
  await expect(grid).toContainText("C — Finn");
  await expect(grid).toContainText("D — Nora's café");
  await expect(grid).toContainText(
    "Woman in the green coat boards the first crossing after the fog with exact change.",
  );
});

test("Dana opens 205's room log Beside and sees its tag bar and seeded entries", async ({
  page,
}) => {
  await signedInAs(
    page,
    "dana",
    `${docPath("medium/harbour-lights/205")}?panels=closed`,
  );
  await expect(page.locator(EDITABLE)).toBeVisible();

  await page
    .getByRole("button", {
      name: DOCUMENT_WORDS.titleMenu(
        seedDoc("medium/harbour-lights/205").title,
      ),
    })
    .click();
  await page.locator("[data-tour='doc.openBeside']").click();
  await page
    .getByRole("option", { name: ROOM_LOG_WORDS.entry })
    .first()
    .click();

  const beside = page.locator("[data-tour='beside']");
  await expect(beside).toBeVisible();
  await expect(beside).toContainText(
    ROOM_LOG_WORDS.title(seedDoc("medium/harbour-lights/205").title),
  );
  const tagsGroup = beside.getByRole("group", {
    name: ROOM_LOG_WORDS.tagsGroup,
  });
  await expect(tagsGroup).toBeVisible();
  for (const tag of Object.keys(
    ROOM_LOG_TAG_WORDS,
  ) as (keyof typeof ROOM_LOG_TAG_WORDS)[]) {
    await expect(
      tagsGroup.getByRole("button", { name: ROOM_LOG_WORDS.tagButton(tag) }),
    ).toBeVisible();
  }
  await expect(beside).toContainText(
    "Open straight on Finn at the café counter eating three breakfasts in silence.",
  );
});
