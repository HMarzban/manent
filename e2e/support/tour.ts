// Every Tour test is written with tourScenario, so it performs the scenario the Tour shows; the sign-in, Tour and demo
// steps other tests start from live here too.
import { localDatabaseName } from "@manent/client-web";
import { TOUR } from "@manent/demo";
import { DOCUMENT_WORDS, LIBRARY_WORDS } from "@manent/ui";
import type { TourScenario } from "@manent/demo";
import { expect, test } from "@playwright/test";
import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";

/**
 * Opens `open` (default `/`) with `?person=<userId>` added and waits until the app drops `?person=`, which it does once
 * the tab is that person, so a next navigation or action cannot overtake the sign-in. You's first visit to the Library
 * opens the blank script of a first launch; its Library is then opened again, holding it, and every later visit waits
 * until Continue lists that script, so that no first launch overtakes the test.
 */
export async function signedInAs(
  page: Page,
  userId: string,
  open = "/",
): Promise<void> {
  const url = new URL(open, "http://localhost");
  url.searchParams.set("person", userId);
  await page.goto(`${url.pathname}${url.search}${url.hash}`);
  await page.waitForURL((at) => !at.searchParams.has("person"));
  if (userId !== "you" || url.pathname !== "/") return;
  // the first launch opens its script; a later visit lists in Continue the script the first one opened
  const opened = await page.waitForFunction(
    (heading) =>
      location.pathname.startsWith("/s/")
        ? "first"
        : document.querySelector(`section[aria-label="${heading}"] .mn-row`) !==
            null && "later",
    LIBRARY_WORDS.continueHeading,
  );
  if ((await opened.jsonValue()) !== "first") return;
  // back inside the app, which has the new script in its index already; by key, as a click would leave the next focus
  // drawn as a pointer's in Firefox and WebKit
  await page.getByRole("button", { name: "‹ Library" }).press("Enter");
  await page.waitForURL((at) => at.pathname === "/");
}

/**
 * Waits until every write the page has begun to `userId`'s store on this device is committed: a read of the whole store
 * waits for each write begun before it.
 */
export async function committedOnDevice(
  page: Page,
  userId: string,
): Promise<void> {
  await page.evaluate(
    (name) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open(name);
        opening.addEventListener("error", () => reject(opening.error));
        opening.addEventListener("success", () => {
          const db = opening.result;
          const stores = [...db.objectStoreNames];
          const read = db.transaction(stores, "readonly");
          for (const store of stores) read.objectStore(store).count();
          read.addEventListener("complete", () => {
            db.close();
            resolve();
          });
          read.addEventListener("abort", () => {
            db.close();
            reject(read.error);
          });
        });
      }),
    localDatabaseName(userId),
  );
}

/** Re-seeds the demo: each person's first visit to the Library, which the server keeps with them, is to come again. */
export async function reseedDemo(request: APIRequestContext): Promise<void> {
  const answer: unknown = await (await request.get("/api/demo")).json();
  const control: unknown = Reflect.get(Object(answer), "control");
  const url: unknown = Reflect.get(Object(control), "url");
  const token: unknown = Reflect.get(Object(control), "token");
  if (typeof url !== "string" || typeof token !== "string")
    throw new Error("the demo names no control to reset it with");
  const reset = await request.post(`${url}/reset`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(await reset.json()).toEqual({ server: "running" });
}

/** Closes the Tour that a person's first visit to the Library opens, once it has opened, so the next screen shows no panel. */
export async function closeFirstTour(page: Page): Promise<void> {
  const close = page
    .locator("[data-region='side_panel']")
    .getByRole("button", { name: DOCUMENT_WORDS.closeSidePanel });
  await close.click();
  await expect(close).toHaveCount(0);
}

/** Registers the test of the Tour scenario `id`, with its window, and its second window when it has one, already open. Throws a RangeError when the Tour has no such scenario. */
export function tourScenario(
  id: string,
  body: (args: {
    page: Page;
    context: BrowserContext;
    scenario: TourScenario;
  }) => Promise<void>,
): void {
  const scenario = TOUR.scenarios.find((s) => s.id === id);
  if (scenario === undefined)
    throw new RangeError(`the Tour has no scenario ${id}`);
  test(`Tour: ${scenario.promise}`, async ({ page, context }) => {
    const { setup } = scenario;
    await signedInAs(page, setup.userId, setup.open);
    if (setup.secondWindow !== null)
      await signedInAs(
        await context.newPage(),
        setup.secondWindow.userId,
        setup.secondWindow.open,
      );
    await body({ page, context, scenario });
  });
}
