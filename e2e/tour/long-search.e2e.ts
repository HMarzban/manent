// The Tour's long-search scenario: Dana searches Lanternfield Studios for Tamsin Hale and filters by folder.
import { expect, test } from "@playwright/test";
import { E2E_PORT } from "../support/ports.ts";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

const HEAVY_READY_MS = 1_200_000;
const POLL_MS = 5000;

test.describe.configure({ timeout: 120_000 });

test.beforeAll(async ({ playwright }) => {
  test.setTimeout(HEAVY_READY_MS + 60_000);
  const api = await playwright.request.newContext({
    baseURL: `http://localhost:${E2E_PORT}`,
  });
  const signIn = await api.post("/api/sign-in", { data: { userId: "dana" } });
  const token: unknown = Reflect.get(Object(await signIn.json()), "token");
  if (typeof token !== "string")
    throw new Error("the demo did not sign dana in");
  await expect
    .poll(
      async () => {
        const me: unknown = await (
          await api.get("/api/me", {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).json();
        const workspaces: unknown = Reflect.get(Object(me), "workspaces");
        return Array.isArray(workspaces)
          ? workspaces.map((w: unknown) => [
              Reflect.get(Object(w), "id"),
              Reflect.get(Object(w), "seeding"),
            ])
          : workspaces;
      },
      { timeout: HEAVY_READY_MS, intervals: [POLL_MS] },
    )
    .toContainEqual(["heavy", null]);
  await api.dispose();
});

tourScenario("long-search", async ({ page, scenario, step }) => {
  const [fourDocs, bookTitle, oneDoc] = scenario.evidence;

  const switcher = await step(0);
  await switcher.click();
  await page
    .getByRole("menuitem")
    .filter({ hasText: "Lanternfield Studios" })
    .click();
  await expect(switcher).toContainText("Lanternfield Studios");

  await selectTourStep(page, scenario.promise, 1);
  await page.locator("[data-tour='app.palette']").click();
  const paletteInput = page.locator("input[role='combobox']").first();
  await expect(paletteInput).toBeVisible();
  await paletteInput.fill("Search this workspace");
  await page
    .locator("[role='option']")
    .filter({ hasText: "Search this workspace" })
    .first()
    .click();

  const searchField = page.locator("[data-search-field='library']");
  await expect(searchField).toBeFocused();
  await searchField.fill("Tamsin Hale");

  await expectEvidence([page], {
    ...scenario,
    evidence: [fourDocs!, bookTitle!],
  });

  const filter = await step(2);
  await filter.click();
  await page
    .getByRole("menuitemcheckbox", { name: "Audio, Books & Games" })
    .click();

  await expect(searchField).toHaveValue(/folder:"Audio, Books & Games"/);
  await expectEvidence([page], { ...scenario, evidence: [oneDoc!] });
});
