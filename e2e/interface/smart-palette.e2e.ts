// Smart Command Palette in the live browser: contextual Smart Home, in-place toggle pills, scope filters, synonyms and persistence.
import { expect, test } from "@playwright/test";
import { pressKeyOf } from "../support/interface.ts";
import { openMadeScript } from "../support/made-script.ts";
import { signedInAs } from "../support/tour.ts";

const DOC_ID = "7a2e3d4c-5b6f-4a70-9b8c-0d1e2f3a4b5c";

test("Smart Command Palette adapts to Library and open Script, toggles settings in place, filters scopes and persists usage", async ({
  page,
}) => {
  const shotDir = process.env.SMART_PALETTE_SHOT_DIR ?? null;
  await page.emulateMedia({ colorScheme: "dark" });
  await signedInAs(page, "you");
  await page.goto("/");

  // 1. Library context
  await pressKeyOf(page, "app.palette");
  const field = page.getByRole("combobox", { name: "Commands" });
  await expect(field).toBeFocused();
  await expect(page.locator("[data-palette-context]")).toHaveText("Library");
  await expect(
    page.locator(".mn-group-label", { hasText: "Suggested here" }),
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

  // 2. Open script context
  await openMadeScript(page, "you", DOC_ID);
  await pressKeyOf(page, "app.palette");
  await expect(field).toBeFocused();
  await expect(page.locator("[data-palette-context]")).toContainText(
    "Screenplay",
  );
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

  // Usage persists across reload
  await page.reload();
  await page.waitForSelector(".ProseMirror");
  await pressKeyOf(page, "app.palette");
  await expect(
    page.locator(".mn-group-label", { hasText: "Last used" }),
  ).toHaveCount(1);
  await expect(
    page.locator('[role="option"][data-tour="view.focusMode"]'),
  ).toHaveCount(1);
  if (shotDir !== null) {
    await page.emulateMedia({ colorScheme: "light" });
    await page.screenshot({ path: `${shotDir}/palette-script-light.png` });
    await page.setViewportSize({ width: 375, height: 740 });
    await page.screenshot({ path: `${shotDir}/palette-mobile.png` });
  }
});
