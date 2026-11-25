// The Tour's history-version-link scenario: Dana copies a version link to Studio draft, and Sam opens it read-only.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("history-version-link", async ({ windows, scenario, step }) => {
  const [dana, sam] = windows as [Page, Page];
  const [copiedMsg, viewingDraft, backToWorking] = scenario.evidence;
  await dana.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await dana.getByRole("tab", { name: DOCUMENT_WORDS.historyTab }).click();
  const historyList = await step(0);
  const row = historyList
    .getByRole("listitem")
    .filter({ hasText: "Studio draft" })
    .first();
  await row.click();
  await selectTourStep(dana, scenario.promise, 1);
  await row
    .getByRole("button", { name: DOCUMENT_WORDS.rowMenuName("Studio draft") })
    .click();
  await step(1);
  await dana
    .getByRole("menu")
    .locator('[data-tour="history.copyLink"]')
    .click();
  await expectEvidence([dana], { ...scenario, evidence: [copiedMsg!] });
  const link = await dana.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("/v/");
  await sam.goto(link);
  await step(2);
  await expectEvidence([sam], {
    ...scenario,
    evidence: [viewingDraft!, backToWorking!],
  });
});
