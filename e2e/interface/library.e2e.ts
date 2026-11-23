import { DEMO_WORKSPACES } from "@manent/demo";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { pressKeyOf } from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";

const DOCUMENT_PATH = new RegExp(
  "/s/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
);

/** The key that moves focus forward; WebKit on macOS, as Safari does, tabs to a button only with Option held. */
const tabKey = (browserName: string): string =>
  browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";

const focused = (page: Page) => page.locator(":focus");

// a new script left with no text and its first name is taken out of the Library when it is left
const editable = (page: Page) =>
  page.locator("[data-region='page'] [contenteditable='true']");

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
  // New script puts focus on the page at the caret
  await expect(editable(page)).toBeFocused();
  await page.keyboard.type("The tide turns.");
  await expect(editable(page)).toContainText(/the tide turns/i);
  await page.getByRole("button", { name: "‹ Library" }).click();
  await expect(page.getByRole("region", { name: "Continue" })).toContainText(
    "Untitled script",
  );
});

test("focus moved elsewhere as the switcher closes stays there, and the field takes what is typed", async ({
  page,
}) => {
  await signedInAs(page, "dana");
  const switcher = page.getByRole("button", {
    name: "Writers' room",
    exact: true,
  });
  await switcher.click();
  await expect(page.getByRole("menuitem")).toHaveCount(2);
  // a press outside closes the menu, and the palette opens while the menu is still fading out
  await page.mouse.click(8, 400);
  await pressKeyOf(page, "app.palette");
  const field = page.getByRole("combobox");
  await expect(field).toBeFocused();
  // the palette takes focus straight back, so the switcher counts each time focus reaches it
  await switcher.evaluate((button) => {
    button.dataset["reached"] = "0";
    button.addEventListener("focus", () => {
      button.dataset["reached"] = String(Number(button.dataset["reached"]) + 1);
    });
  });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.type("tide");
  await expect(field).toHaveValue("tide");
  await expect(field).toBeFocused();
  await expect(switcher).toHaveAttribute("data-reached", "0");
});

test("the Library is reached by keys alone", async ({ page, browserName }) => {
  const tab = tabKey(browserName);
  // a writer: a reader of the workspace cannot add a project to it
  await signedInAs(page, "priya");
  const heading = page.getByRole("heading", { name: "Library" });
  await expect(heading).toBeFocused();
  // the switcher is drawn once the server has listed the person's workspaces
  await expect(
    page.getByRole("button", { name: "Writers' room", exact: true }),
  ).toBeVisible();
  // a first project, made with keys: New project, after Import… and New script, then its first card
  for (let press = 0; press < 4; press++) await page.keyboard.press(tab);
  await expect(focused(page)).toHaveText("New project");
  await page.keyboard.press("Enter");
  await expect(focused(page)).toContainText("Film");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(DOCUMENT_PATH);
  // the document's screen has replaced the Library, with focus at the caret
  await expect(heading).toHaveCount(0);
  await expect(editable(page)).toBeFocused();
  await page.keyboard.type("The tide turns.");
  await expect(editable(page)).toContainText(/the tide turns/i);
  await page.goBack();
  await expect(heading).toBeFocused();
  // the side list's projects each open, so each takes a stop of its own before the main column
  const sideRows = await page
    .locator("[data-region='left_panel'] .mn-row[tabindex]")
    .count();
  const order: string[] = [];
  for (let press = 0; press < 6 + sideRows; press++) {
    await page.keyboard.press(tab);
    order.push((await focused(page).textContent()) ?? "");
  }
  expect([...order.slice(0, 6), ...order.slice(5 + sideRows)]).toEqual([
    "Writers' room",
    "Import…",
    "New script",
    "New project",
    "PN",
    // the project is numbered after the film projects the workspace holds already
    expect.stringMatching(/^Untitled film( \d+)?$/),
    // the row ends with where the script is, which changes as it syncs
    expect.stringMatching(/^Untitled scriptUntitled film( \d+)? · Film/),
  ]);
});
