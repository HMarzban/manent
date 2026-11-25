// The Tour's long-go-to scenario: Dana jumps directly to page 1,873 of a 2,000-page book.
import { expect, test } from "@playwright/test";
import { E2E_PORT } from "../support/ports.ts";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

const HEAVY_READY_MS = 1_200_000;
const POLL_MS = 5000;

test.describe.configure({ timeout: 180_000 });

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

tourScenario("long-go-to", async ({ page, scenario, step }) => {
  await expect(page.locator("[data-tour='status:page']")).toBeVisible({
    timeout: 60_000,
  });

  await selectTourStep(page, scenario.promise, 0);
  await page.locator("[data-tour='app.palette']").click();
  const paletteInput = page.locator("input[role='combobox']").first();
  await expect(paletteInput).toBeVisible();
  await paletteInput.fill("Go to");
  await page
    .locator("[role='option']")
    .filter({ hasText: /^Go to/ })
    .first()
    .click();

  const placesInput = page.locator("input[role='combobox']").first();
  await expect(placesInput).toBeVisible();
  await placesInput.fill("1873");
  await expect(
    page.locator("[role='option']").filter({ hasText: "1873" }).first(),
  ).toBeVisible();
  await placesInput.press("Enter");

  const readout = await step(1);
  await expect(readout).toContainText("Page 1873 of 2,000");
  await expectEvidence([page], scenario);
});
