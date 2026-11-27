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

  // 4. Track 2: Inline numeric setting ask (Lines per page -> 50 -> Undo announced)
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
  await expect(
    page.locator('[data-tour="message_slot"]').getByRole("button", {
      name: "Undo",
    }),
  ).toBeVisible();

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
});
