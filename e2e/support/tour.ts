// Every Tour test is written with tourScenario, so it performs the scenario the Tour shows.
import { TOUR } from "@manent/demo";
import type { TourScenario } from "@manent/demo";
import { test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

/** Opens `open` (default `/`) with `?person=<userId>` added and waits until the app drops `?person=`, which it does once the tab is that person, so a next navigation or action cannot overtake the sign-in. */
export async function signedInAs(
  page: Page,
  userId: string,
  open = "/",
): Promise<void> {
  const url = new URL(open, "http://localhost");
  url.searchParams.set("person", userId);
  await page.goto(`${url.pathname}${url.search}${url.hash}`);
  await page.waitForURL((at) => !at.searchParams.has("person"));
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
