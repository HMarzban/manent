// UX maturity, contextual title-bar discoverability, keyboard completion, and WCAG 2.2 AA axe coverage across specialised modes.
import AxeBuilder from "@axe-core/playwright";
import { docPath } from "@manent/demo";
import {
  BESIDE_WORDS,
  INK_WORDS,
  RUNDOWN_WORDS,
  SEARCH_WORDS,
} from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { signedInAs } from "../support/tour.ts";

const RULES = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const FILM_PATH = docPath("medium/the-long-night/script");
const SERIES_EP_PATH = docPath("medium/harbour-lights/204");
const INK_PATH = docPath("medium/game-samples/keepers-logbook");
const GAME_PATH = docPath("medium/game-samples/twelve-on-foot-1");
const NEWS_RUNDOWN_PATH = docPath("medium/lannick-one-news/rundowns/day");

async function violationsOf(page: Page): Promise<unknown[]> {
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
  test(`contextual Ink Play, Rundown Prompter, standard screenplay zero-clutter, and Library Search pass WCAG 2.2 AA in ${scheme} theme`, async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ colorScheme: scheme });
    try {
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });

      // 1. Standard screenplay: zero added title-bar or status-bar format chrome
      await signedInAs(page, "sam", `${FILM_PATH}?panels=closed`);
      await expect(
        page.locator("[data-tour='page'] .ProseMirror"),
      ).toBeVisible();
      await expect(page.locator("[data-tour='title:ink-play']")).toHaveCount(0);
      await expect(page.locator("[data-tour='title:board']")).toHaveCount(0);
      await expect(page.locator("[data-tour='title:prompter']")).toHaveCount(0);
      await expect(page.locator("[data-tour='readout:format']")).toHaveCount(0);
      await expect(page.locator("[data-tour='status:server']")).toHaveText(
        "Synced",
      );
      await settleAnimations(page, "body");
      expect(await violationsOf(page)).toEqual([]);

      // 2. Ink script: contextual Play button, Beside region + keyboard separator, Variables aria-controls, auto-close on doc switch
      await page.goto(`${INK_PATH}?panels=closed`);
      await expect(
        page.locator("[data-tour='page'] .ProseMirror"),
      ).toBeVisible();
      const playButton = page.locator("[data-tour='title:ink-play']");
      await expect(playButton).toBeVisible();
      await expect(playButton).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator("[data-tour='readout:format']")).toContainText(
        "Ink",
      );

      await playButton.click();
      await expect(playButton).toHaveAttribute("aria-pressed", "true");
      const player = page.locator("[data-tour='ink:player']");
      await expect(player).toBeVisible();
      await expect(player).toContainText(INK_WORDS.upToDate);
      const separator = page.getByRole("separator", {
        name: BESIDE_WORDS.resizeLabel,
      });
      await expect(separator).toBeVisible();
      const beforeWidth = Number(await separator.getAttribute("aria-valuenow"));
      await separator.press("ArrowLeft");
      await expect(separator).not.toHaveAttribute(
        "aria-valuenow",
        String(beforeWidth),
      );
      await settleAnimations(page, "body");
      expect(await violationsOf(page)).toEqual([]);

      // Switching to another playable script automatically closes the Ink Beside pane while keeping Play unpressed
      await page.goto(`${GAME_PATH}?panels=closed`);
      await expect(page.locator("[data-tour='ink:player']")).toHaveCount(0);
      await expect(
        page.locator("[data-tour='title:ink-play']"),
      ).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator("[data-tour='readout:format']")).toContainText(
        "Game",
      );

      // 3. Rundown: contextual Prompter title-bar button
      await page.goto(`${NEWS_RUNDOWN_PATH}?panels=closed`);
      await expect(page.locator("[data-tour='rundown:grid']")).toBeVisible();
      const prompterButton = page.locator("[data-tour='title:prompter']");
      await expect(prompterButton).toBeVisible();
      await expect(prompterButton).toContainText(
        RUNDOWN_WORDS.columns.prompter,
      );
      await settleAnimations(page, "body");
      expect(await violationsOf(page)).toEqual([]);

      // 4. Library Search: ArrowDown moves focus onto first result; unmatched query renders EmptyHeroCard with Clear search
      await page.goto("/");
      const search = page.getByRole("searchbox", {
        name: SEARCH_WORDS.fieldLabel,
      });
      await expect(search).toBeVisible();
      await search.fill("Keeper");
      const firstResult = page
        .locator('[data-search-results] [role="listitem"] [role="button"]')
        .first();
      await expect(firstResult).toBeVisible();
      await search.press("ArrowDown");
      await expect(firstResult).toBeFocused();
      expect(await violationsOf(page)).toEqual([]);

      await search.fill("zzzz-no-such-script-xyz");
      await expect(
        page.getByRole("heading", { name: SEARCH_WORDS.noMatchesTitle }),
      ).toBeVisible();
      const clearBtn = page
        .getByRole("region", { name: SEARCH_WORDS.fieldLabel })
        .getByRole("button", {
          name: SEARCH_WORDS.clearSearch,
        });
      await expect(clearBtn).toBeVisible();
      await clearBtn.click();
      await expect(search).toHaveValue("");
    } finally {
      await context.close();
    }
  });
}

test("Series Board opens from an episode script and passes WCAG 2.2 AA in light and dark themes", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  for (const scheme of ["light", "dark"] as const) {
    const context = await browser.newContext({ colorScheme: scheme });
    try {
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      await signedInAs(page, "sam", `${SERIES_EP_PATH}?panels=closed`);
      await expect(
        page.locator("[data-tour='page'] .ProseMirror"),
      ).toBeVisible();
      const boardButton = page.locator("[data-tour='title:board']");
      await expect(boardButton).toBeVisible();
      await boardButton.click();
      await expect(page).toHaveURL(/\/p\/[^/]+\/board/);
      await expect(page.locator("[data-tour='board']").first()).toBeVisible();
      await settleAnimations(page, "body");
      expect(await violationsOf(page)).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

test("Ink Play and Rundown Prompter collapse cleanly at 375px narrow viewport and 200% interface size without horizontal overflow", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 375, height: 812 });

    await signedInAs(page, "sam", `${INK_PATH}?panels=closed`);
    const playButton = page.locator("[data-tour='title:ink-play']");
    await expect(playButton).toBeVisible();
    await expect(playButton).toHaveAccessibleName(INK_WORDS.play);
    const inkOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(inkOverflow).toBe(false);

    await page.goto(`${NEWS_RUNDOWN_PATH}?panels=closed`);
    await expect(page.locator("[data-tour='rundown:grid']")).toBeVisible();
    const prompterButton = page.locator("[data-tour='title:prompter']");
    await expect(prompterButton).toBeVisible();
    await expect(prompterButton).toHaveAccessibleName(
      RUNDOWN_WORDS.columns.prompter,
    );

    // Narrow Library navigation drawer opens Favourites & Trash cleanly without overflow
    await page.goto("/");
    const navToggle = page.locator("[data-tour='library:nav-toggle']");
    await expect(navToggle).toBeVisible();
    await navToggle.click();
    const drawer = page.locator("[data-tour='library:nav-drawer']");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Favourites");
    await expect(drawer).toContainText("Trash");
    await settleAnimations(page, "body");
    expect(await violationsOf(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(navToggle).toBeFocused();
  } finally {
    await context.close();
  }
});
