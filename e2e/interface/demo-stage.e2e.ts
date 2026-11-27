// Concept A Smart Demo Stage in the live browser: Unified 432 px Stage Sheet (Demo controls + Tour story tracks),
// screen-adapted quick actions, zero-dead-end Open a script, live offline auto-checkoff, top-centre collapse and axe WCAG 2.2 AA audit.
import AxeBuilder from "@axe-core/playwright";
import { DEMO_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { signedInAs } from "../support/tour.ts";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag22aa"];

async function expectDemoAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include("[data-surface='demo']")
    .withTags(AXE_TAGS)
    .analyze();
  expect(results.violations).toEqual([]);
}

test("Concept A Demo Stage unifies Tour story tracks and Demo controls, adapts per screen, auto-verifies offline survival, collapses top-centre and passes axe", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const shotDir = process.env.DEMO_STAGE_SHOT_DIR ?? null;

  await signedInAs(page, "dana");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();

  const demoBar = page.getByRole("region", { name: DEMO_WORDS.demo });
  await expect(demoBar).toBeVisible();
  // Library has zero dead script-only quick actions
  await expect(
    demoBar.getByRole("button", { name: DEMO_WORDS.quickFiveWriters }),
  ).toHaveCount(0);
  await expect(
    demoBar.getByRole("button", { name: DEMO_WORDS.quickSecondWindow }),
  ).toHaveCount(0);

  // 1. Mission Pill opens the Unified 432 px Stage Sheet directly on the Tour tab
  await demoBar.getByRole("button", { name: DEMO_WORDS.tryProof }).click();
  const sheet = page.locator(
    "[data-slot='popover-content'][data-surface='demo']",
  );
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(DEMO_WORDS.chooseTourHeading);
  await expect(sheet).toContainText(DEMO_WORDS.trackOverviewTitle);
  await expect(sheet).toContainText(DEMO_WORDS.trackScreenwriterTitle);
  await expect(sheet).toContainText(DEMO_WORDS.trackShowrunnerTitle);
  await expect(sheet).toContainText(DEMO_WORDS.trackCoordinatorTitle);
  await expect(sheet).toContainText(DEMO_WORDS.trackBroadcastTitle);
  await expect(sheet).toContainText(DEMO_WORDS.trackGameTitle);
  await expect(sheet).toContainText(DEMO_WORDS.trackResilienceTitle);
  await expect(sheet).toContainText(DEMO_WORDS.tryFormatsHeading);
  await expect(
    sheet.getByRole("button", { name: DEMO_WORDS.formatBook, exact: true }),
  ).toBeVisible();
  await expect(
    sheet.getByRole("button", {
      name: DEMO_WORDS.formatBroadcastGraphics,
      exact: true,
    }),
  ).toBeVisible();
  if (shotDir !== null) {
    await page.screenshot({ path: `${shotDir}/stage-tours-light.png` });
  }
  await expectDemoAxeClean(page);

  // 2. Switch to Demo controls tab: 3 full-width vertical blast-radius bands + 1-click Open a script
  await sheet
    .getByRole("tab", { name: new RegExp(DEMO_WORDS.stageTabControls) })
    .click();
  await expect(sheet).toContainText(DEMO_WORDS.scopeWindow);
  await expect(sheet).toContainText(DEMO_WORDS.scopeScript);
  await expect(sheet).toContainText(DEMO_WORDS.scopeAll);
  await expect(sheet).toContainText(DEMO_WORDS.allWindowsNote);
  const openScriptBtn = sheet.getByRole("button", {
    name: DEMO_WORDS.openScriptPrompt,
  });
  await expect(openScriptBtn).toBeVisible();
  if (shotDir !== null) {
    await page.screenshot({
      path: `${shotDir}/stage-controls-library-light.png`,
    });
  }
  await expectDemoAxeClean(page);

  // 3. 1-click Open a script launches into a live screenplay with contextual quick actions
  await openScriptBtn.click();
  await expect(page.locator("[data-tour='page']")).toBeVisible();
  const offlineQuick = demoBar.getByRole("button", {
    name: DEMO_WORDS.offline,
  });
  await expect(offlineQuick).toBeVisible();
  await expect(
    demoBar.getByRole("button", { name: DEMO_WORDS.quickFiveWriters }),
  ).toBeVisible();
  await expect(
    demoBar.getByRole("button", { name: DEMO_WORDS.quickSecondWindow }),
  ).toBeVisible();

  // Close Tour side panel if open so we can verify calm screenplay bar + live auto-checkoff
  const closeSide = page.getByRole("button", { name: "Close side panel" });
  if (await closeSide.isVisible().catch(() => false)) {
    await closeSide.click();
  }
  // Dismiss active Tour floating bar so the default screenplay Mission Pill is visible
  const closeFloat = page.getByRole("button", { name: "Close" });
  if (await closeFloat.isVisible().catch(() => false)) {
    await closeFloat.click();
  }

  // 4. Live auto-verifier: Offline -> type -> Go online -> emerald Verified banner + Next CTA
  await offlineQuick.click();
  const reconnectBtn = demoBar.getByRole("button", {
    name: DEMO_WORDS.reconnect,
  });
  await expect(reconnectBtn).toBeVisible();
  const firstAction = page
    .locator("[data-tour='page'] [data-type='action']")
    .first();
  await firstAction.click();
  await settled(page);
  await page.keyboard.type(" Rain taps on the harbour window.");
  await reconnectBtn.click();
  await expect(demoBar).toContainText(DEMO_WORDS.verifiedOffline);
  await expect(
    demoBar.getByRole("button", { name: DEMO_WORDS.missionNext }),
  ).toBeVisible();
  if (shotDir !== null) {
    await page.screenshot({ path: `${shotDir}/stage-verified-light.png` });
  }

  // 5. Hide demo bar collapses to a top-centre restore tab that clears both Title Bar edges
  await demoBar.getByRole("button", { name: DEMO_WORDS.hideDemoBar }).click();
  const restoreTab = demoBar.getByRole("button", {
    name: DEMO_WORDS.showDemoBar,
  });
  await expect(restoreTab).toBeVisible();
  const tabBox = await restoreTab.boundingBox();
  const viewport = page.viewportSize()!;
  expect(tabBox).not.toBeNull();
  const tabCenterX = tabBox!.x + tabBox!.width / 2;
  expect(Math.abs(tabCenterX - viewport.width / 2)).toBeLessThan(16);
  if (shotDir !== null) {
    await page.screenshot({ path: `${shotDir}/stage-collapsed-light.png` });
  }
  await restoreTab.click();
  await expect(
    demoBar.getByRole("button", { name: DEMO_WORDS.proofLab }),
  ).toBeVisible();

  // 6. Dark mode Stage Sheet on a live script passes WCAG 2.2 AA axe-core audit
  await page.emulateMedia({ colorScheme: "dark" });
  await demoBar.getByRole("button", { name: DEMO_WORDS.proofLab }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("input[type='range']")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Reorganise" })).toHaveCount(
    0,
  );
  if (shotDir !== null) {
    await page.screenshot({
      path: `${shotDir}/stage-controls-script-dark.png`,
    });
  }
  await expectDemoAxeClean(page);
});
