// Mature PWA delivery: manifest and icons, 404 anti-poisoning, zero CSP violations,
// true cold airplane-mode launch without sessionStorage injection, and safe one-click update reload.
import { join } from "node:path";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
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

test.describe.configure({ timeout: 180_000 });

const ROOT = join(import.meta.dir, "..", "..");

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

const controlled = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => navigator.serviceWorker.controller !== null);

test("manifest, icons, 404 asset guard, and zero CSP violations hold on live load", async ({
  browserName,
}) => {
  const context = await launchProfile(browserName);
  const page = await context.newPage();
  const cspViolations: string[] = [];
  await page.addInitScript(() => {
    const violations: string[] = [];
    Reflect.set(window, "__cspViolations", violations);
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(
        `${event.violatedDirective}:${event.blockedURI || "inline"}`,
      );
    });
  });

  await page.goto("/");
  const manifestRes = await page.request.get("/manifest.webmanifest");
  expect(manifestRes.status()).toBe(200);
  expect(manifestRes.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  const manifest = (await manifestRes.json()) as {
    name: string;
    display: string;
    icons: readonly { src: string }[];
  };
  expect(manifest.name).toBe("Manent");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.length).toBeGreaterThanOrEqual(4);
  for (const icon of manifest.icons) {
    const iconRes = await page.request.get(icon.src);
    expect(iconRes.status(), icon.src).toBe(200);
  }

  // Missing hashed assets must return 404 no-store, never 200 index.html.
  const missingChunk = await page.request.get("/chunk-nonexistent.js");
  expect(missingChunk.status()).toBe(404);
  expect(missingChunk.headers()["cache-control"]).toContain("no-store");

  const recorded = await page.evaluate(
    () => Reflect.get(window, "__cspViolations") as string[],
  );
  cspViolations.push(...recorded);
  expect(cspViolations).toEqual([]);
});

test("cold airplane-mode relaunch opens directly into Library without sessionStorage injection", async ({
  browserName,
}) => {
  const context = await launchProfile(browserName);
  const page = await personIn(context, "dana");
  const docId = await writeScript(page);
  const lines = await pageText(page);
  await controlled(page);
  await goOffline(context, page);

  let cold = page;
  try {
    // Close every open tab and open a brand-new tab with NO sessionStorage injection.
    for (const each of context.pages()) await each.close();
    cold = await context.newPage();
    await keepEveryHooks(cold);
    await cold.goto("/");
    await expect(
      cold.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible({ timeout: 20_000 });
    await cold.goto(`/s/${docId}`);
    await expect.poll(() => pageText(cold)).toBe(lines);
  } finally {
    await goOnline(context, cold);
  }
});

test.afterAll(() => buildWeb("test"));

test("an update waiting in the background surfaces a calm reload action and activates cleanly", async ({
  browserName,
}) => {
  const context = await launchProfile(browserName);
  const page = await personIn(context, "dana");
  await writeScript(page);
  await controlled(page);
  const testBuild = (): Promise<string> =>
    page.evaluate(() => typeof Reflect.get(window, "__manent"));
  expect(await testBuild()).toBe("object");

  await typeIn(page, SPEECH, " kept safe");
  await buildWeb("production");
  await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistration())?.update(),
  );

  // Update notice appears calmly without interrupting typing.
  const reloadButton = page.getByRole("button", { name: "Reload to update" });
  await expect(reloadButton).toBeVisible({ timeout: 30_000 });
  expect(await pageText(page)).toContain("The boats are in kept safe");
  expect(await testBuild()).toBe("object");

  // Clicking Reload to update sends SKIP_WAITING and lands on the new production build.
  await reloadButton.click();
  await page.waitForFunction(
    () => typeof Reflect.get(window, "__manent") === "undefined",
    undefined,
    { timeout: 30_000 },
  );
  await expect(page.locator("[data-editor-host]")).toContainText(
    "The boats are in kept safe",
    { timeout: 20_000 },
  );
});
