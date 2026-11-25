// Shared Playwright helpers for rundown and prompter end-to-end tests.
import { expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

/** Ensures Lannick One News day D is inside its air window with story 01 changed via the demo preparation route. */
export async function ensureNewsAirWindow(
  request: APIRequestContext,
): Promise<void> {
  const signIn = await request.post("/api/sign-in", {
    data: { userId: "ana" },
  });
  const token: unknown = Reflect.get(Object(await signIn.json()), "token");
  if (typeof token !== "string")
    throw new Error("the demo did not sign ana in");
  const prepared = await request.post("/api/demo/tour/prepare", {
    headers: { Authorization: `Bearer ${token}` },
    data: { scenarioId: "rundown-send" },
  });
  expect(await prepared.json()).toEqual({ ok: true });
}
