// The Tour's together-links scenario: Dana copies a link to changes since Studio draft, and Sam opens that comparison.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("together-links", async ({ windows, scenario, step }) => {
  const [dana, sam] = windows as [Page, Page];
  const [copiedMsg, showingBar] = scenario.evidence;
  await dana.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await selectTourStep(dana, scenario.promise, 0);
  await dana.getByRole("heading", { level: 1 }).getByRole("button").click();
  await (await step(0)).click();
  await dana
    .getByRole("button", { name: DOCUMENT_WORDS.historyTab, exact: true })
    .click();
  await dana.locator("[data-changes-since]").click();
  await dana
    .getByRole("menuitem", { name: "Studio draft", exact: true })
    .click();
  await (await step(1)).click();
  await expectEvidence([dana], { ...scenario, evidence: [copiedMsg!] });
  const link = await dana.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("/s/");
  await sam.goto(link);
  await step(2);
  await expectEvidence([sam], { ...scenario, evidence: [showingBar!] });
});
