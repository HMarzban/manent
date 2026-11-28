// Cross-browser WCAG 2.2 AA accessibility and UX maturity coverage for Rundown, Comments, Share, Sync Centre, Editor Inspector, FindBar and Scenes.
import AxeBuilder from "@axe-core/playwright";
import { docPath } from "@manent/demo";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { pressKeyOf, togglePanel } from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";

const RULES = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const EPISODE_PATH = docPath("medium/harbour-lights/204");
const NEWS_RUNDOWN_PATH = docPath("medium/lannick-one-news/rundowns/day");

async function violationsOf(page: Page): Promise<unknown[]> {
  // Wait for any fading offline-ready toast to finish leaving so axe never measures mid-fade opacity contrast.
  await page
    .locator('aside[aria-label="Offline status"][data-leaving="true"]')
    .waitFor({ state: "detached", timeout: 5_000 })
    .catch(() => {});
  const axe = new AxeBuilder({ page })
    .withTags(RULES)
    .exclude("[data-base-ui-focus-guard]");
  return (await axe.analyze()).violations;
}

async function settleAnimations(page: Page, selector: string): Promise<void> {
  const node = page.locator(selector);
  await expect(node).toBeVisible();
  await node.evaluate((element) =>
    Promise.allSettled(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => {
          const iterations = animation.effect?.getComputedTiming().iterations;
          return (
            animation.playState === "running" &&
            typeof iterations === "number" &&
            Number.isFinite(iterations)
          );
        })
        .map((animation) => animation.finished),
    ),
  );
}

for (const scheme of ["light", "dark"] as const) {
  test(`Editor Inspector, Comments, Sync Centre, Share, FindBar and Rundown pass WCAG 2.2 AA in ${scheme} theme`, async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ colorScheme: scheme });
    try {
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });

      // 1. Episode script: Inspector (Numbers & Goal), Comments, Sync Centre, Share, FindBar, Left Panel
      await signedInAs(page, "sam", `${EPISODE_PATH}?panels=closed`);
      await expect(
        page.locator("[data-tour='page'] .ProseMirror"),
      ).toBeVisible();

      // Open right side panel -> Details Inspector
      await togglePanel(page, "view.sidePanel");
      const detailsTab = page.locator("[data-tour='tab:details']");
      await expect(detailsTab).toBeVisible();
      await detailsTab.click();
      await expect(page.locator("[data-tour='details:numbers']")).toBeVisible();
      await expect(page.locator("[data-tour='script.goal']")).toBeVisible();
      await settleAnimations(page, "[data-region='side_panel']");
      expect(await violationsOf(page)).toEqual([]);

      // Switch to Comments tab
      const commentsTab = page.locator("[data-tour='tab:comments']");
      await expect(commentsTab).toBeVisible();
      await commentsTab.click();
      await settleAnimations(page, "[data-region='side_panel']");
      expect(await violationsOf(page)).toEqual([]);

      // Open Sync Centre popover and close cleanly
      const syncTrigger = page.locator("[data-tour='app.syncCentre']");
      await expect(syncTrigger).toBeVisible();
      await syncTrigger.click();
      await expect(page.locator("[data-slot='popover-content']")).toBeVisible();
      await settleAnimations(page, "[data-slot='popover-content']");
      expect(await violationsOf(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.locator("[data-slot='popover-content']")).toHaveCount(
        0,
      );

      // Open Share dialog, verify axe, and close with Escape
      const shareTrigger = page.locator("[data-tour='share']");
      await expect(shareTrigger).toBeVisible();
      await shareTrigger.click();
      const shareDialog = page.locator("[role='dialog']").first();
      await expect(shareDialog).toBeVisible();
      await settleAnimations(page, "[role='dialog']");
      expect(await violationsOf(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.locator("[role='dialog']")).toHaveCount(0);

      // Open FindBar via shortcut, type query, verify axe, and dismiss with Escape
      await pressKeyOf(page, "edit.find");
      const findInput = page
        .locator(
          "[data-region='page'] input[type='search'], input[type='search']",
        )
        .first();
      await expect(findInput).toBeVisible();
      await findInput.fill("harbour");
      await settleAnimations(page, "body");
      expect(await violationsOf(page)).toEqual([]);
      await page.keyboard.press("Escape");

      // Open left panel (Scenes list & toolbar)
      await togglePanel(page, "view.leftPanel");
      await expect(page.locator("[data-region='left_panel']")).toBeVisible();
      await settleAnimations(page, "[data-region='left_panel']");
      expect(await violationsOf(page)).toEqual([]);

      // 2. Rundown Grid + Footer + Details Rundown scope (desktop + 375px narrow overflow check)
      await page.goto(`${NEWS_RUNDOWN_PATH}?panels=closed`);
      await expect(page.locator("[data-tour='rundown:grid']")).toBeVisible();
      await expect(page.locator("[data-tour='rundown:footer']")).toBeVisible();
      await togglePanel(page, "view.sidePanel");
      await expect(page.locator("section[data-scope='rundown']")).toBeVisible();
      await settleAnimations(page, "body");
      expect(await violationsOf(page)).toEqual([]);

      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`${NEWS_RUNDOWN_PATH}?panels=closed`);
      await expect(page.locator("[data-tour='rundown:footer']")).toBeVisible();
      const hasOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      );
      expect(hasOverflow).toBe(false);
    } finally {
      await context.close();
    }
  });
}
