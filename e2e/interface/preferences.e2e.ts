import { SECTION_IDS } from "@manent/settings";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { pressKeyOf } from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";

/** Whether anything on the page, or the page itself, is wider than the box that holds it. */
const scrollsSideways = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) return true;
    return [...document.querySelectorAll("*")].some((element) => {
      const { overflowX } = getComputedStyle(element);
      return (
        (overflowX === "auto" || overflowX === "scroll") &&
        element.scrollWidth > element.clientWidth
      );
    });
  });

test("⌘, d a r k ↓ → changes the theme without the pointer", async ({
  page,
}) => {
  await signedInAs(page, "leo");
  await expect(page.getByRole("heading", { name: "Library" })).toBeFocused();
  const theme = () => page.locator("html").getAttribute("data-theme");
  const before = await theme();
  await pressKeyOf(page, "app.preferences");
  await expect(page.getByRole("searchbox", { name: "Search…" })).toBeFocused();
  await page.keyboard.type("dark");
  await expect(page.getByText("2 preferences")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect.poll(theme).not.toBe(before);
});

test("Preferences opens on the last pane, each pane has an address, and ⌘, goes back", async ({
  page,
}) => {
  await signedInAs(page, "leo");
  await expect(page.getByRole("heading", { name: "Library" })).toBeFocused();
  await pressKeyOf(page, "app.preferences");
  await expect(page).toHaveURL(/\/preferences\/writing\?from=%2F$/);
  await expect(page).toHaveTitle(
    "Preferences — Writing — Leo Marsh — Manent demo",
  );
  await page.getByRole("tab", { name: "Keyboard" }).click();
  await expect(page).toHaveURL(/\/preferences\/keyboard\?from=%2F$/);
  await expect(
    page.getByRole("heading", { name: "Keyboard", level: 2 }),
  ).toBeVisible();
  await pressKeyOf(page, "app.preferences");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await pressKeyOf(page, "app.preferences");
  await expect(page).toHaveURL(/\/preferences\/keyboard\?from=%2F$/);
  await page.goto("/preferences/appearance");
  await expect(
    page.getByRole("heading", { name: "Appearance", level: 2 }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Appearance" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("at 200 % in a 1,280 px window and at 100 % in 320 px nothing scrolls sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signedInAs(page, "leo", "/preferences/device");
  await page.getByRole("button", { name: "200 %" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ui-size", "200");
  const wide: Record<string, boolean> = {};
  for (const pane of SECTION_IDS) {
    await page.goto(`/preferences/${pane}`);
    await expect(page.locator("section[aria-labelledby] h2")).toBeVisible();
    wide[pane] = await scrollsSideways(page);
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/preferences/device");
  await page.getByRole("button", { name: "100 %" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-ui-size");
  // the pane list is a menu above the controls
  await expect(page.getByRole("tablist")).toBeHidden();
  await expect(
    page.getByRole("combobox", { name: "Preferences" }),
  ).toContainText("This browser");
  const narrow: Record<string, boolean> = {};
  for (const pane of SECTION_IDS) {
    await page.goto(`/preferences/${pane}`);
    await expect(page.locator("section[aria-labelledby] h2")).toBeVisible();
    narrow[pane] = await scrollsSideways(page);
  }
  const none = Object.fromEntries(SECTION_IDS.map((pane) => [pane, false]));
  expect({ wide, narrow }).toEqual({ wide: none, narrow: none });
});
