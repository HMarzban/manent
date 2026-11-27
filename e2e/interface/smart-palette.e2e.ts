// Smart Command Palette in the live browser: contextual Smart Home, in-place toggle pills, direct jumps, inline numeric settings, Quick Jumps, scope filters, synonyms, persistence and axe WCAG 2.2 AA audit.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { pressKeyOf } from "../support/interface.ts";
import { openMadeScript } from "../support/made-script.ts";
import { signedInAs } from "../support/tour.ts";

const DOC_ID = "7a2e3d4c-5b6f-4a70-9b8c-0d1e2f3a4b5c";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag22aa"];

test("Smart Command Palette adapts to Library and open Script, toggles settings in place, runs direct jumps and inline numeric asks, persists usage and passes axe", async ({
  page,
}) => {
  const shotDir = process.env.SMART_PALETTE_SHOT_DIR ?? null;
  await page.emulateMedia({ colorScheme: "dark" });
  await signedInAs(page, "you");
  await page
    .locator('section[aria-label="Continue"] .mn-row')
    .first()
    .waitFor();

  // 1. Library context (signedInAs("you") leaves one script in Continue -> Jump to appears)
  await pressKeyOf(page, "app.palette");
  const field = page.getByRole("combobox", { name: "Commands" });
  await expect(field).toBeFocused();
  await expect(page.locator("[data-palette-context]")).toHaveText("Library");
  await expect(
    page.locator(".mn-group-label", { hasText: "Suggested here" }),
  ).toHaveCount(1);
  await expect(
    page.locator(".mn-group-label", { hasText: "Jump to" }),
  ).toHaveCount(1);
  await expect(
    page.locator(".mn-group-label", { hasText: "Settings here" }),
  ).toHaveCount(1);
  if (shotDir !== null) {
    await page.screenshot({ path: `${shotDir}/palette-library-dark.png` });
  }

  // Scope cycling via Tab and reset via Backspace
  await page.keyboard.press("Tab");
  await expect(page.locator('[data-palette-scope="commands"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Backspace");
  await expect(page.locator('[data-palette-scope="all"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);

  // 2. Open script context + WCAG 2.2 AA axe audit (dark)
  await openMadeScript(page, "you", DOC_ID);
  await page.waitForSelector(".ProseMirror");
  await pressKeyOf(page, "app.palette");
  await expect(field).toBeFocused();
  await expect(page.locator("[data-palette-context]")).toContainText(
    "Screenplay",
  );

  const darkAxe = await new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    .exclude("[data-base-ui-focus-guard]")
    .analyze();
  expect(darkAxe.violations).toEqual([]);

  // In-place toggle pill flips Off -> On without closing the palette
  const toggleRow = page.locator(
    '[role="option"][data-tour="setting.writing.typewriterScrolling"]',
  );
  await expect(toggleRow.locator(".mn-palette-toggle")).toHaveAttribute(
    "data-state",
    "off",
  );
  await toggleRow.click();
  await expect(toggleRow.locator(".mn-palette-toggle")).toHaveAttribute(
    "data-state",
    "on",
  );
  await expect(field).toBeVisible();
  if (shotDir !== null) {
    await page.screenshot({ path: `${shotDir}/palette-script-dark.png` });
  }

  // Acronym & synonym & apostrophe-normalised search
  await field.fill("scene numbers");
  await expect(page.locator('[role="option"][data-highlighted]')).toContainText(
    "Scene numbers:",
  );
  await field.fill("contd");
  await expect(page.locator('[role="option"][data-highlighted]')).toContainText(
    "(CONT'D)",
  );
  await field.fill("fm");
  await expect(page.locator('[role="option"][data-highlighted]')).toContainText(
    "Focus mode",
  );
  await page.keyboard.press("Enter");
  await expect(field).toHaveCount(0);

  // Return Focus mode to off so subsequent full-page light-mode axe checks normal chrome contrast
  await pressKeyOf(page, "app.palette");
  await field.fill("fm");
  await page.keyboard.press("Enter");
  await expect(field).toHaveCount(0);

  // 3. Track 1: Direct navigation to Comments tab and Checks disclosure
  await pressKeyOf(page, "app.palette");
  await field.fill("Comments");
  await expect(page.locator('[role="option"][data-highlighted]')).toContainText(
    "Comments",
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("tab", { name: "Comments", selected: true }),
  ).toBeVisible();

  await pressKeyOf(page, "app.palette");
  await field.fill("Checks");
  await expect(page.locator('[role="option"][data-highlighted]')).toContainText(
    "Checks",
  );
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-checks-section]")).toBeVisible();

  // 4. Track 2 & Phase 3: Inline numeric setting ask + power-user trailing prefill ("lines 52")
  await pressKeyOf(page, "app.palette");
  await field.fill("Lines per page");
  await expect(page.locator('[role="option"][data-highlighted]')).toContainText(
    "Lines per page",
  );
  await page.keyboard.press("Enter");
  const askInput = page.locator("input.mn-palette-field");
  await expect(askInput).toBeFocused();
  await askInput.fill("50");
  await page.keyboard.press("Enter");
  await expect(askInput).toHaveCount(0);
  await expect(page.locator('[data-tour="message_slot"]')).toContainText(
    "Lines per page is now 50",
  );
  const undoBtn = page
    .locator('[data-tour="message_slot"]')
    .getByRole("button", { name: "Undo" });
  await expect(undoBtn).toBeVisible();
  await undoBtn.click();
  await expect(undoBtn).toHaveCount(0);

  // Power-user trailing numeric prefill ("lines 52") pre-fills PaletteAsk directly
  await pressKeyOf(page, "app.palette");
  await field.fill("lines 52");
  await expect(page.locator('[role="option"][data-highlighted]')).toContainText(
    "Lines per page",
  );
  await page.keyboard.press("Enter");
  await expect(askInput).toBeFocused();
  await expect(askInput).toHaveValue("52");
  await page.keyboard.press("Enter");
  await expect(askInput).toHaveCount(0);
  await expect(page.locator('[data-tour="message_slot"]')).toContainText(
    "Lines per page is now 52",
  );

  // ARIA active-descendant tracking and Escape focus return to the editor
  await page.locator(".ProseMirror").click();
  await pressKeyOf(page, "app.palette");
  const activeId = await field.getAttribute("aria-activedescendant");
  expect(activeId).toBeTruthy();
  await expect(
    page.locator('[role="option"][data-highlighted]'),
  ).toHaveAttribute("id", activeId!);
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(page.locator(".ProseMirror")).toBeFocused();

  // 5. Usage persists across reload + WCAG 2.2 AA axe audit (light)
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await page.waitForSelector(".ProseMirror");
  await pressKeyOf(page, "app.palette");
  await expect(
    page.locator(".mn-group-label", { hasText: "Last used" }),
  ).toHaveCount(1);
  await expect(
    page.locator('[role="option"][data-tour="doc.linesPerPage"]'),
  ).toHaveCount(1);

  const lightAxe = await new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    .exclude("[data-base-ui-focus-guard]")
    .analyze();
  expect(lightAxe.violations).toEqual([]);

  if (shotDir !== null) {
    await page.screenshot({ path: `${shotDir}/palette-script-light.png` });
    await page.setViewportSize({ width: 375, height: 740 });
    await page.screenshot({ path: `${shotDir}/palette-mobile.png` });
  }

  // 6. Track 1: Direct Preferences pane jump from palette
  await field.fill("Preferences: Appearance");
  await expect(page.locator('[role="option"][data-highlighted]')).toContainText(
    "Preferences: Appearance",
  );
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/preferences\/appearance/);

  const heroShot = process.env.SMART_PALETTE_HERO_SHOT ?? null;
  if (heroShot !== null) {
    await page.setViewportSize({ width: 1200, height: 760 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`/s/${DOC_ID}`);
    await page.waitForSelector(".ProseMirror");
    // Close side panel if open so the full page frames the palette cleanly
    const closeSide = page.getByRole("button", { name: "Close side panel" });
    if (await closeSide.isVisible()) await closeSide.click();
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("INT. LIGHTHOUSE LAMP ROOM - NIGHT");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter");
    await page.keyboard.type(
      "Wind hammers the glass. MARA, sixty, winds the clockwork by hand.",
    );
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.type("MARA");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Forty years, and she has never once gone dark.");
    await page.keyboard.press("Enter");
    await page.keyboard.type("A light flickers out at sea.");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.type("MARA");
    await page.keyboard.press("Enter");
    await page.keyboard.type("That's no fishing boat.");
    await pressKeyOf(page, "app.palette");
    await expect(field).toBeFocused();
    await page.screenshot({ path: heroShot });
  }
});
