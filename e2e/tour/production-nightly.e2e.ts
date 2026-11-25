// The Tour's production-nightly scenario: Dana opens Send draft on 305 and sees Full draft marked against Network run-through draft.
import { seedDoc } from "@manent/demo";
import { DOCUMENT_WORDS, DRAFTS_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import { E2E_PORT } from "../support/ports.ts";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

// Lanternfield Studios is seeded in the background: at most the hard fail of its seeding budget
const HEAVY_READY_MS = 1_200_000;
const POLL_MS = 5000;

test.beforeAll(async ({ playwright }) => {
  test.setTimeout(HEAVY_READY_MS + 60_000);
  const api = await playwright.request.newContext({
    baseURL: `http://localhost:${E2E_PORT}`,
  });
  try {
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
  } finally {
    await api.dispose();
  }
});

tourScenario("production-nightly", async ({ page, scenario, step }) => {
  await selectTourStep(page, scenario.promise, 0);
  await page
    .getByRole("button", {
      name: DOCUMENT_WORDS.titleMenu(seedDoc("heavy/h25/305").title),
    })
    .click();
  await (await step(0)).click();
  const whatRow = await step(1);
  await expect(whatRow).toContainText(DRAFTS_WORDS.fullDraft);
  await expect(whatRow).toContainText(
    DRAFTS_WORDS.markedAgainstLastSent("Network run-through draft"),
  );
  await expectEvidence([page], scenario);
});
