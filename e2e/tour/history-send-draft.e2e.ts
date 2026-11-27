// The Tour's history-send-draft scenario: Dana sends 204 to Network with asterisks against Studio draft and checks History.
import { seedDoc } from "@manent/demo";
import { DOCUMENT_WORDS, DRAFTS_WORDS, PRODUCTION_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

// a fresh seed comes first
test.describe.configure({ timeout: 180_000 });

tourScenario("history-send-draft", async ({ page, scenario, step }) => {
  const [sentMsg, historyRow] = scenario.evidence;
  await selectTourStep(page, scenario.promise, 0);
  await page
    .getByRole("button", {
      name: DOCUMENT_WORDS.titleMenu(
        seedDoc("medium/harbour-lights/204").title,
      ),
    })
    .click();
  await (await step(0)).click();
  await expect(
    page.getByRole("textbox", { name: DRAFTS_WORDS.draftNameLabel }),
  ).toHaveValue("Network");
  const asRow = page.locator("[data-tour='send:as']");
  const markedSwitch = asRow.getByRole("switch", {
    name: PRODUCTION_WORDS.pdfMarked,
  });
  if ((await markedSwitch.getAttribute("aria-checked")) !== "true")
    await markedSwitch.click();
  await expect(
    asRow.getByRole("combobox", { name: DRAFTS_WORDS.asterisksAgainst }),
  ).toContainText("Studio draft");
  const toRow = await step(1);
  await toRow
    .getByRole("combobox", { name: DRAFTS_WORDS.addPlaceholder })
    .click();
  await toRow.getByRole("option", { name: "Network (4)" }).click();
  const sendButton = await step(2);
  await expect(sendButton).toContainText("Send to 4 people");
  await sendButton.click();
  await expect(page).toHaveURL((at) => !at.pathname.includes("/send"));
  await expectEvidence([page], { ...scenario, evidence: [sentMsg!] });
  await page
    .getByRole("button", { name: DOCUMENT_WORDS.historyTab, exact: true })
    .click();
  await expect(page.locator("[data-tour='history_list']")).toBeVisible();
  const historyList = await step(3);
  await expect(historyList).toContainText(historyRow!);
  await expectEvidence([page], { ...scenario, evidence: [historyRow!] });
});
