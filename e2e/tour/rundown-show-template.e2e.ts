// The Tour's rundown-show-template scenario: save The Late Desk as project default template and create tomorrow's rundown from it.
import { DOCUMENT_WORDS, RUNDOWN_WORDS, SHOW_TEMPLATE_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("rundown-show-template", async ({ page, scenario, step }) => {
  const [savedDefault, newRundownLabel] = scenario.evidence;

  await expect(page.locator("[data-tour='rundown:grid']")).toBeVisible();

  // Step 0: Open Title ▾ and choose Save template…
  await selectTourStep(page, scenario.promise, 0);
  await page.locator("[data-region='title_bar'] h1 button").click();
  await (await step(0)).click();

  // Step 1: Keep This project's default selected and confirm Save template.
  const dialog = page.locator("[data-surface='save_template_dialog']");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(SHOW_TEMPLATE_WORDS.rundownStripNote);
  const projectDefaultRadio = dialog.getByRole("radio", {
    name: SHOW_TEMPLATE_WORDS.projectDefault,
  });
  await expect(projectDefaultRadio).toHaveAttribute("aria-checked", "true");

  await dialog
    .getByRole("button", { name: SHOW_TEMPLATE_WORDS.saveAction, exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await selectTourStep(page, scenario.promise, 1);
  await expectEvidence([page], { ...scenario, evidence: [savedDefault!] });

  // Step 2: Return to the project Library and choose New rundown on The Late Desk.
  await page.getByRole("button", { name: DOCUMENT_WORDS.back }).click();
  await page.waitForURL((at) => at.pathname === "/");

  const lateDeskSection = page.locator('section[aria-label="The Late Desk"]');
  await expect(lateDeskSection).toBeVisible();
  await lateDeskSection.scrollIntoViewIfNeeded();
  await lateDeskSection.click({ position: { x: 8, y: 8 } });
  await selectTourStep(page, scenario.promise, 2);
  await step(2);

  const newRundownBtn = lateDeskSection.getByRole("button", {
    name: RUNDOWN_WORDS.newRundown,
    exact: true,
  });
  await expect(newRundownBtn).toBeVisible();
  await expect(newRundownBtn).toContainText(newRundownLabel!);
  await expect(
    lateDeskSection.locator("[data-tour='rundown:new_menu']"),
  ).toBeVisible();
  await expectEvidence([page], { ...scenario, evidence: [newRundownLabel!] });

  const priorUrl = page.url();
  await newRundownBtn.click();
  await page.waitForURL(
    (at) => at.pathname.startsWith("/s/") && at.href !== priorUrl,
  );

  // Fresh rundown carries saved acts and rows, with cleared previous values / live timings.
  const grid = page.locator("[data-tour='rundown:grid']");
  await expect(grid).toBeVisible();
  await expect(grid).toContainText("ACT ONE");
  await expect(grid).toContainText("ACT TWO");
  await expect(grid).toContainText("Monologue");
  await expect(grid).toContainText("Band intro");
  await expect(page.getByText(RUNDOWN_WORDS.wasValue("9:00"))).toHaveCount(0);
});
