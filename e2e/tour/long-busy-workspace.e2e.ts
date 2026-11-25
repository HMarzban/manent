import { expect, test } from "@playwright/test";
import { E2E_PORT } from "../support/ports.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

// Lanternfield Studios is seeded in the background: at most the hard fail of its seeding budget
const HEAVY_READY_MS = 1_200_000;
const POLL_MS = 5000;

// before the scenario's windows open, so they open on the workspace as it is when ready
test.beforeAll(async ({ playwright }) => {
  // a hook keeps its own time limit: the wait, and a minute to open and close its requests
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

tourScenario("long-busy-workspace", async ({ page, scenario, step }) => {
  const [, studio = ""] = scenario.evidence;
  await (await step(0)).click();
  await expectEvidence([page], scenario);
  // close the modal dropdown before clicking the Tour panel for step 1, then reopen it to choose the studio
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  const switcher = await step(1);
  await switcher.click();
  await page.getByRole("menuitem").filter({ hasText: studio }).click();
  await expect(switcher).toContainText(studio);
});
