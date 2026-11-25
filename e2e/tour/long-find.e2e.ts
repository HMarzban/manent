// The Tour's long-find scenario: Dana finds "the Founding" across a 2,000-page book and steps through matches.
import { FIND_WORDS } from "@manent/ui";
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

tourScenario("long-find", async ({ page, scenario, step }) => {
  await expect(page.locator("[data-tour='status:page']")).toBeVisible({
    timeout: 60_000,
  });

  await selectTourStep(page, scenario.promise, 0);
  await page.locator("[data-tour='app.palette']").click();
  const paletteInput = page.locator("input[role='combobox']").first();
  await expect(paletteInput).toBeVisible();
  await paletteInput.fill(FIND_WORDS.find);
  await page
    .locator("[role='option']")
    .filter({ hasText: new RegExp(`^${FIND_WORDS.find}`) })
    .first()
    .click();

  const findInput = page.getByRole("searchbox", { name: FIND_WORDS.find });
  await expect(findInput).toBeVisible();
  await findInput.fill("the Founding");

  await expectEvidence([page], scenario);

  await step(1);
  const nextButton = page.getByRole("button", { name: FIND_WORDS.next });
  await expect(nextButton).toBeVisible();
  await nextButton.click();
  await expect(page.getByText(/^2 of /)).toBeVisible();
});
