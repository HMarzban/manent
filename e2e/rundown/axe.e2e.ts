// Automated accessibility rules on the rundown screen, previous-value popover, Details → Rundown, Prompter column and prompter window in light and dark themes.
import AxeBuilder from "@axe-core/playwright";
import { docPath, seedDoc } from "@manent/demo";
import {
  PROMPTER_WINDOW_WORDS,
  PROMPTER_WORDS,
  RUNDOWN_WORDS,
} from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { togglePanel } from "../support/interface.ts";
import { ensureNewsAirWindow } from "../support/rundown.ts";
import { signedInAs } from "../support/tour.ts";

const RULES = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const NEWS_RUNDOWN_KEY = "medium/lannick-one-news/rundowns/day";
const LATE_DESK_RUNDOWN_KEY = "medium/the-late-desk/rundowns/day";
const ROW_8_SEGMENT = "Guest one: Tessa Morland (Ida in Harbour Lights)";

/** Runs axe WCAG 2 A/AA/2.1 AA/2.2 AA rules, excluding Base UI's nameless focus-guard buttons in WebKit. */
async function violationsOf(page: Page): Promise<unknown[]> {
  const axe = new AxeBuilder({ page })
    .withTags(RULES)
    .exclude("[data-base-ui-focus-guard]");
  return (await axe.analyze()).violations;
}

/** Waits for running CSS animations inside `selector` to finish so computed contrast reflects the settled colour. */
async function settleAnimations(page: Page, selector: string): Promise<void> {
  const node = page.locator(selector);
  await expect(node).toBeVisible();
  await node.evaluate((element) =>
    Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    ),
  );
}

for (const scheme of ["light", "dark"] as const) {
  test(`rundown screen, Prompter column, Details → Rundown and cell popover pass axe in ${scheme} theme`, async ({
    browser,
    request,
  }) => {
    test.setTimeout(90_000);
    await ensureNewsAirWindow(request);

    const context = await browser.newContext({ colorScheme: scheme });
    try {
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });

      await signedInAs(
        page,
        "ana",
        `${docPath(NEWS_RUNDOWN_KEY)}?panels=closed`,
      );
      await expect(page.locator("[data-tour='rundown:grid']")).toBeVisible();
      await expect(
        page.locator("[data-tour='rundown:prompter_column']").first(),
      ).toBeVisible();
      await expect(
        page
          .locator('[role="gridcell"][data-col-id="prompter"]')
          .filter({ hasText: PROMPTER_WORDS.onPrompter })
          .first(),
      ).toBeVisible();
      await expect(
        page
          .locator('[role="gridcell"][data-col-id="prompter"]')
          .filter({ hasText: PROMPTER_WORDS.changed })
          .first(),
      ).toBeVisible();
      await settleAnimations(page, "[data-tour='state_bar']");

      const findings: { surface: string; violations: unknown[] }[] = [];
      const record = async (surface: string): Promise<void> => {
        const found = await violationsOf(page);
        if (found.length > 0) findings.push({ surface, violations: found });
      };

      await record(`${scheme} rundown + prompter column`);

      await togglePanel(page, "view.sidePanel");
      const detailsRundown = page.locator('section[data-scope="rundown"]');
      await expect(detailsRundown).toBeVisible();
      await expect(page.locator("[data-tour='rundown:air']")).toBeVisible();
      await settleAnimations(page, "[data-region='side_panel']");
      await record(`${scheme} details → rundown`);

      await page.goto(`${docPath(LATE_DESK_RUNDOWN_KEY)}?panels=closed`);
      await expect(page.locator("[data-tour='rundown:grid']")).toBeVisible();
      await settleAnimations(page, "[data-tour='state_bar']");
      const row8Menu = page.getByRole("button", {
        name: RUNDOWN_WORDS.rowHandle(ROW_8_SEGMENT),
      });
      await expect(row8Menu).toBeVisible();
      await row8Menu.click();
      await page.getByRole("menuitem", { name: "Previous value" }).click();
      await settleAnimations(page, "[data-surface='cell_popover']");
      await record(`${scheme} cell_popover`);

      expect(findings).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test("prompter window passes axe in dark and light themes", async ({
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  await ensureNewsAirWindow(request);
  const rundownDocId = seedDoc(NEWS_RUNDOWN_KEY).docId;

  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    await signedInAs(page, "ana", `/s/${rundownDocId}/prompter`);
    await page.waitForFunction((live) => {
      const win = document.querySelector("[data-tour='prompter:window']");
      const feed = document.querySelector("[data-tour='prompter:feed']");
      const block = document.querySelector("[data-prompter-block]");
      return (
        win?.getAttribute("data-theme") === "dark" &&
        Boolean(feed?.textContent?.includes(live)) &&
        block !== null
      );
    }, PROMPTER_WINDOW_WORDS.live);

    const findings: { surface: string; violations: unknown[] }[] = [];
    const darkFound = await violationsOf(page);
    if (darkFound.length > 0)
      findings.push({ surface: "dark prompter window", violations: darkFound });

    // CSS locator avoids Firefox's accessibility-tree crash immediately after an axe walk
    const darkSwitch = page
      .locator("header div", { hasText: PROMPTER_WINDOW_WORDS.dark })
      .locator("[role='switch']")
      .first();
    await darkSwitch.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("[data-tour='prompter:window']")
          ?.getAttribute("data-theme") === "light",
    );
    const lightFound = await violationsOf(page);
    if (lightFound.length > 0)
      findings.push({
        surface: "light prompter window",
        violations: lightFound,
      });

    expect(findings).toEqual([]);
  } finally {
    await context.close();
  }
});
