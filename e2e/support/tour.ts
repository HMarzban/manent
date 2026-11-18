// Every Tour test is written with tourScenario, so it performs the scenario the Tour shows.
import { TOUR } from "@manent/demo";
import type { TourScenario } from "@manent/demo";
import { test } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";

/** `open` with `?person=<userId>` added, which makes the window that person. */
function asPerson(open: string, userId: string): string {
  const url = new URL(open, "http://localhost");
  url.searchParams.set("person", userId);
  return `${url.pathname}${url.search}${url.hash}`;
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
    await page.goto(asPerson(setup.open, setup.userId));
    if (setup.secondWindow !== null) {
      const second = await context.newPage();
      await second.goto(
        asPerson(setup.secondWindow.open, setup.secondWindow.userId),
      );
    }
    await body({ page, context, scenario });
  });
}
