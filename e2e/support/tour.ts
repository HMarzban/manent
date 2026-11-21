// Every Tour test is written with tourScenario, so it performs the scenario the Tour shows.
import { TOUR } from "@manent/demo";
import { LIBRARY_WORDS } from "@manent/ui";
import type { TourScenario } from "@manent/demo";
import { test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

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
  // back inside the app, which has the new script in its index already
  await page.getByRole("button", { name: "‹ Library" }).click();
  await page.waitForURL((at) => at.pathname === "/");
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
