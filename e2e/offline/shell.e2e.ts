// The app's shell from the service worker: it opens with no network, and a new version waits for the next launch.
import { join } from "node:path";
import { expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { keepEveryHooks } from "../support/editor-hooks.ts";
import {
  SPEECH,
  goOffline,
  goOnline,
  launchProfile,
  pageText,
  personIn,
  test,
  typeIn,
  writeScript,
} from "./support.ts";

// a profile of its own, signing in and building the app again, take longer than the default
test.describe.configure({ timeout: 180_000 });

const ROOT = join(import.meta.dir, "..", "..");
const SESSION_KEY = "manent.demo.session";

/** Builds the web app in `flavour` into the folder the demo serves, as the demo's own build does. */
async function buildWeb(flavour: "test" | "production"): Promise<void> {
  const { MANENT_FLAVOUR: _flavour, ...env } = process.env;
  const build = Bun.spawn(["bun", "apps/web/build.ts"], {
    cwd: ROOT,
    env: flavour === "test" ? { ...env, MANENT_FLAVOUR: "test" } : env,
    stdout: "ignore",
    stderr: "pipe",
  });
  if ((await build.exited) !== 0)
    throw new Error(
      `the ${flavour} build stopped: ${await new Response(build.stderr).text()}`,
    );
}

/** Waits until the service worker controls `page`, so the shell is in its cache. */
const controlled = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => navigator.serviceWorker.controller !== null);

/**
 * Closes every page of `context`, then opens a new one at `open` as the person `page`'s tab was: a reopened tab keeps
 * its person, which a new page of the profile is given before the app reads it.
 */
async function reopen(
  context: BrowserContext,
  page: Page,
  open: string,
): Promise<Page> {
  const person = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    SESSION_KEY,
  );
  if (person === null) throw new Error("the tab has no person");
  for (const each of context.pages()) await each.close();
  const again = await context.newPage();
  await again.addInitScript(
    ([key, kept]) => sessionStorage.setItem(key, kept),
    [SESSION_KEY, person] as const,
  );
  await keepEveryHooks(again);
  await again.goto(open);
  return again;
}

test("the app opens with no network, the Library and a deep link alike", async ({
  browserName,
}) => {
  const context = await launchProfile(browserName);
  const page = await personIn(context, "dana");
  const docId = await writeScript(page);
  const lines = await pageText(page);
  await controlled(page);
  await goOffline(context, page);
  let shown = page;
  try {
    shown = await reopen(context, page, "/");
    await expect(
      shown.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();
    await shown.goto(`/s/${docId}`);
    await expect.poll(() => pageText(shown)).toBe(lines);
  } finally {
    await goOnline(context, shown);
  }
});

// the tests after these run on the test build the demo started with
test.afterAll(() => buildWeb("test"));

test("a new version waits for the next launch and never interrupts typing", async ({
  browserName,
}) => {
  const context = await launchProfile(browserName);
  const page = await personIn(context, "dana");
  await writeScript(page);
  await controlled(page);
  const testBuild = () =>
    page.evaluate(() => typeof Reflect.get(window, "__manent"));
  expect(await testBuild()).toBe("object");
  await typeIn(page, SPEECH, " unsaved words");
  await page.evaluate(() => Reflect.set(window, "__probe", 1));
  // the production build's chunks, and so its worker, differ from the test build's
  await buildWeb("production");
  await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistration())?.update(),
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          async () =>
            ((await navigator.serviceWorker.getRegistration())?.waiting ??
              null) !== null,
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
  expect(await page.evaluate(() => Reflect.get(window, "__probe"))).toBe(1);
  expect(await pageText(page)).toContain("The boats are in unsaved words");
  expect(await testBuild()).toBe("object");
  const next = await reopen(context, page, "/");
  await expect(
    next.getByRole("heading", { level: 1, name: "Library" }),
  ).toBeVisible();
  expect(
    await next.evaluate(() => typeof Reflect.get(window, "__manent")),
  ).toBe("undefined");
});
