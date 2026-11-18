// Opens the sync harness on the demo's own origin, so that the page is a secure context with
// the demo's IndexedDB and Web Locks, and waits on what it reports.
import { join } from "node:path";
import type { Page } from "@playwright/test";

const PAGE = `<!doctype html>
<meta charset="utf-8">
<title>Sync harness</title>
<script type="module" src="/__sync-harness.js"></script>
`;

let script: Promise<string> | null = null;

/** The harness built for the browser, once per run. */
function harnessScript(): Promise<string> {
  script ??= (async () => {
    const build = await Bun.build({
      entrypoints: [join(import.meta.dir, "harness.ts")],
      target: "browser",
    });
    const [output] = build.outputs;
    if (!build.success || output === undefined)
      throw new AggregateError(build.logs, "the sync harness did not build");
    return output.text();
  })();
  return script;
}

/** The pages whose harness routes are in place, so that opening the harness again adds none. */
const routed = new WeakSet<Page>();

async function route(page: Page): Promise<void> {
  if (routed.has(page)) return;
  routed.add(page);
  // a page the test fulfils has no network address, so Chromium asks before it opens a socket to loopback;
  // the other two have no such permission
  if (page.context().browser()?.browserType().name() === "chromium")
    await page.context().grantPermissions(["local-network-access"]);
  // a glob matches the whole URL, and the page is always opened with a query
  await page.route("**/__sync-harness.html?*", (request) =>
    request.fulfill({ contentType: "text/html", body: PAGE }),
  );
  await page.route("**/__sync-harness.js", async (request) =>
    request.fulfill({
      contentType: "text/javascript",
      body: await harnessScript(),
    }),
  );
}

/** Signs in from the test's side, which an offline page cannot do. */
async function signIn(page: Page, userId: string): Promise<string> {
  const response = await page.request.post("/api/sign-in", {
    data: { userId },
  });
  const body: unknown = await response.json();
  if (
    !response.ok() ||
    typeof body !== "object" ||
    body === null ||
    !("token" in body) ||
    typeof body.token !== "string"
  )
    throw new Error(
      `the sign-in of ${userId} was answered ${response.status()}`,
    );
  return body.token;
}

/** What the harness needs of the browser and it lacks: it is reported, never worked around. */
function missingFeatures(lease: boolean): string[] {
  return [
    ...(lease || navigator.locks !== undefined ? [] : ["Web Locks"]),
    ...("durability" in IDBTransaction.prototype
      ? []
      : ["IndexedDB's durability option"]),
  ];
}

/**
 * Loads the harness signed in as `userId` and resolves once `window.harness` exists.
 * `leader: "lease"` leads by the lease, as where Web Locks are missing; `seedId` is
 * the demo seed the page has just seen, which forgets the local store when it changed.
 * Throws when the browser lacks Web Locks (unless leasing) or IndexedDB's durability option.
 */
export async function openHarness(
  page: Page,
  userId: string,
  options: { leader?: "web_locks" | "lease"; seedId?: string } = {},
): Promise<void> {
  await route(page);
  const lease = options.leader === "lease";
  const search = new URLSearchParams({
    user: userId,
    token: await signIn(page, userId),
  });
  if (lease) search.set("lease", "1");
  if (options.seedId !== undefined) search.set("seed", options.seedId);
  await page.goto(`/__sync-harness.html?${search}`);
  const missing = await page.evaluate(missingFeatures, lease);
  if (missing.length > 0)
    throw new Error(`this browser has no ${missing.join(" and no ")}`);
  await page.waitForFunction(() => "harness" in window);
}

/** Resolves once `condition`, run in the page every 10 ms, holds; rejects after 30 s. */
export async function until(
  page: Page,
  condition: () => boolean,
): Promise<void> {
  await page.waitForFunction(condition, undefined, {
    polling: 10,
    timeout: 30_000,
  });
}
