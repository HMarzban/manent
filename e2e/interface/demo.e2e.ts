import { TOUR, isShown } from "@manent/demo";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { pressKeyOf } from "../support/interface.ts";
import { reseedDemo, signedInAs } from "../support/tour.ts";

const tourTab = (page: Page) =>
  page
    .locator("[data-region='side_panel']")
    .getByRole("tabpanel", { name: "Tour" });

const theme = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute("data-theme"));

test("the Tour opens the first time a person reaches the Library, and the Tour button shows and hides it", async ({
  page,
  request,
}) => {
  // a reset re-seeds every workspace through the real write path, which takes the demo some 20 s
  test.setTimeout(90_000);
  // a first visit is once per person on this server, and earlier tests have had Sam's
  await reseedDemo(request);
  await page.goto("/");
  await page.getByRole("button", { name: /^Sam Okafor/ }).click();
  const library = page.getByRole("heading", { name: "Library" });
  const tourButton = page
    .getByRole("region", { name: "Demo" })
    .getByRole("button", { name: "Tour" });
  const groups = TOUR.groups.filter((group) =>
    TOUR.scenarios.some((s) => s.group === group && isShown(s)),
  );
  // a Tour that lists no scenario is not opened on its own
  if (groups.length > 0) {
    // its tab names it, so its groups are its only headings
    await expect(tourTab(page).getByRole("heading")).toHaveText(groups);
    // the Tour never takes focus
    await expect(library).toBeFocused();
    await tourButton.click();
  } else await expect(library).toBeFocused();
  await expect(tourTab(page)).toHaveCount(0);
  await tourButton.click();
  await expect(tourTab(page)).toBeVisible();
  await tourButton.click();
  await expect(tourTab(page)).toHaveCount(0);
  // only the first time
  await page.reload();
  await expect(library).toBeFocused();
  await expect(tourTab(page)).toHaveCount(0);
});

test("two tabs as Sam share the theme, and a tab as Dana keeps hers", async ({
  context,
}) => {
  const sam = await context.newPage();
  await signedInAs(sam, "sam");
  await expect(sam.getByRole("heading", { name: "Library" })).toBeFocused();
  await pressKeyOf(sam, "app.palette");
  await sam.keyboard.type("Theme: Dark");
  await sam.keyboard.press("Enter");
  await expect.poll(() => theme(sam)).toBe("dark");
  const samAgain = await context.newPage();
  await signedInAs(samAgain, "sam");
  await expect(
    samAgain.getByRole("heading", { name: "Library" }),
  ).toBeVisible();
  expect(await theme(samAgain)).toBe("dark");
  const dana = await context.newPage();
  await signedInAs(dana, "dana");
  await expect(dana.getByRole("heading", { name: "Library" })).toBeVisible();
  expect(await theme(dana)).toBe(null);
});
