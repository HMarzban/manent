import { DEMO_WORKSPACES } from "@manent/demo";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { signedInAs } from "../support/tour.ts";

const DOCUMENT_PATH = new RegExp(
  "/s/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
);

/** The key that moves focus forward; WebKit on macOS, as Safari does, tabs to a button only with Option held. */
const tabKey = (browserName: string): string =>
  browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";

const focused = (page: Page) => page.locator(":focus");

test("as Dana the switcher shows both workspaces, and New script opens an untitled script", async ({
  page,
}) => {
  const second = DEMO_WORKSPACES.find((w) => w.id === "heavy")?.name ?? "";
  await signedInAs(page, "dana");
  await page
    .getByRole("button", { name: "Writers' room", exact: true })
    .click();
  const items = page.getByRole("menuitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText("Writers' room");
  await expect(items.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(items.nth(1)).toContainText(second);
  await page.keyboard.press("Escape");
  await page
    .locator('[data-region="title_bar"]')
    .getByRole("button", { name: "New script", exact: true })
    .click();
  await expect(page).toHaveURL(DOCUMENT_PATH);
  await expect(page).toHaveTitle("Untitled script — Dana Reyes — Manent demo");
  await page.getByRole("button", { name: "‹ Library" }).click();
  await expect(page.getByRole("region", { name: "Continue" })).toContainText(
    "Untitled script",
  );
});

test("the Library is reached by keys alone", async ({ page, browserName }) => {
  const tab = tabKey(browserName);
  await signedInAs(page, "leo");
  const heading = page.getByRole("heading", { name: "Library" });
  await expect(heading).toBeFocused();
  // the switcher is drawn once the server has listed the person's workspaces
  await expect(
    page.getByRole("button", { name: "Writers' room", exact: true }),
  ).toBeVisible();
  // a first project, made with keys: New project, then its first card
  for (let press = 0; press < 3; press++) await page.keyboard.press(tab);
  await expect(focused(page)).toHaveText("New project");
  await page.keyboard.press("Enter");
  await expect(focused(page)).toContainText("Film");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(DOCUMENT_PATH);
  // the document's screen has replaced the Library
  await expect(heading).toHaveCount(0);
  await page.goBack();
  await expect(heading).toBeFocused();
  const order: string[] = [];
  for (let press = 0; press < 5; press++) {
    await page.keyboard.press(tab);
    order.push((await focused(page).textContent()) ?? "");
  }
  expect(order).toEqual([
    "Writers' room▾",
    "New script",
    "New project",
    "LM",
    "Untitled scriptUntitled film · FilmOnly in this browser",
  ]);
});
