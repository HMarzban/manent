import { expect, test } from "@playwright/test";
import { caretAt } from "../editor/support.ts";
import { E2E_PORT } from "../support/ports.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

// Lanternfield Studios is seeded in the background: at most the hard fail of its seeding budget
const HEAVY_READY_MS = 1_200_000;
const POLL_MS = 5000;

// two thousand pages take a while to open and lay out
test.describe.configure({ timeout: 180_000 });

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

// about page 1,400 of 2,000, where the scroll bar's thumb is dragged to
const DEEP = 0.7;

tourScenario("long-type-2000", async ({ page, scenario, step }) => {
  await step(0);
  await page
    .locator('[data-region="page"]')
    .evaluate(
      (scroller, at) => scroller.scrollTo(0, scroller.scrollHeight * at),
      DEEP,
    );
  await step(1);
  // a line the scroll brought into view
  const line = await page.evaluate(() => {
    const shown = [
      ...document.querySelectorAll("[data-editor-host] p.el[data-id]"),
    ].find((block) => {
      const box = block.getBoundingClientRect();
      return box.top > 0 && box.bottom < innerHeight;
    });
    if (shown === undefined) throw new Error("no line of the book is in view");
    return shown.getAttribute("data-id") ?? "";
  });
  await caretAt(page, line, "end");
  await page.keyboard.type(
    " The bell rang once more, and the square went quiet.",
  );
  await (await step(2)).click();
  await expectEvidence([page], scenario);
});
