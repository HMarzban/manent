// The Tour's write-library-organise scenario: Dana expands nested folders, drags a project into a subfolder with Undo,
// checks Favourites and Private drafts, and opens her account menu from the top right.
import { expect } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("write-library-organise", async ({ page, scenario, step }) => {
  const [movedMsg, favTitle, privateTitle, prefsLabel] = scenario.evidence;

  const folders = await step(0);
  await folders.getByRole("button", { name: "Scripted", exact: true }).click();
  const source = folders
    .locator(".mn-drag-row")
    .filter({ hasText: "The Lamp Room" })
    .first();
  const target = folders
    .locator("[data-folder-id]")
    .filter({ hasText: "Features" })
    .first();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await source.dragTo(target);
  await expectEvidence([page], { ...scenario, evidence: [movedMsg!] });
  await page.getByRole("button", { name: "Undo", exact: true }).click();

  const favourites = await step(1);
  await favourites.click();
  const favouritesSection = page.locator("section[aria-label='Favourites']");
  await expect(favouritesSection).toContainText(favTitle!);
  await expect(favouritesSection).toContainText("The Long Night");

  const privateNav = await step(2);
  await privateNav.click();
  const privateSection = page.locator("section[aria-label='Private']");
  await expect(privateSection).toContainText(privateTitle!);

  const account = await step(3);
  await account.getByRole("button").click();
  await expect(page.getByRole("menuitem", { name: prefsLabel! })).toBeVisible();
});
