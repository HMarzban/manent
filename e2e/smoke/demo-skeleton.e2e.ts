import { DEMO_PEOPLE, TOUR_GROUPS } from "@manent/demo";
import type { DemoResponse } from "@manent/sync-protocol";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openMadeScript } from "../support/made-script.ts";
import { E2E_CONTROL_PORT } from "../support/ports.ts";
import { reseedDemo, signedInAs } from "../support/tour.ts";

const leo = () => /^Leo Marsh/;
const tourTab = (page: Page) =>
  page
    .locator("[data-region='side_panel']")
    .getByRole("tabpanel", { name: "Tour" });
// the demo bar's line about the server; the message slot is a status too
const serverLine = (page: Page) =>
  page.getByRole("region", { name: "Demo" }).getByRole("status");
const storedPerson = (person: object) =>
  `sessionStorage.setItem("manent.demo.session", ${JSON.stringify(JSON.stringify(person))})`;

// in WebKit, page.route misses the requests of a page a service worker controls
test.use({ serviceWorkers: "block" });

test("a tester chooses a person and reaches the Library", async ({
  page,
  browserName,
  request,
}) => {
  // a first visit is once per person on this server, and earlier tests have had Leo's
  await reseedDemo(request);
  // `/` with no person redirects to the chooser
  await page.goto("/");
  await expect(page).toHaveURL(/\/choose\?next=%2F$/);
  // focused on first load, through a redirect
  await expect(
    page.getByRole("heading", { name: "Choose who you are" }),
  ).toBeFocused();
  await expect(page).toHaveTitle("Choose who you are — Manent demo");
  await expect(
    page.getByText(
      "Pick anyone. You can switch at any time, and each browser tab can be a different person.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Demo" })).toContainText(
    "Demo",
  );
  // no Tour on the chooser
  await expect(tourTab(page)).toHaveCount(0);
  // the whole accessible name, spaces included
  for (const p of DEMO_PEOPLE)
    await expect(
      page.getByRole("button", { name: `${p.name} ${p.title}`, exact: true }),
    ).toBeVisible();
  // the first Tab reaches a person, not the demo bar; WebKit on macOS, as Safari does, tabs to a button only with Option held
  await page.keyboard.press(
    browserName === "webkit" && process.platform === "darwin"
      ? "Alt+Tab"
      : "Tab",
  );
  await expect(page.getByRole("button", { name: /^Dana Reyes/ })).toBeFocused();
  await page.getByRole("button", { name: leo() }).click();
  // focused after a navigation
  await expect(page.getByRole("heading", { name: "Library" })).toBeFocused();
  await expect(page).toHaveTitle("Library — Leo Marsh — Manent demo");
  await expect(page.getByRole("region", { name: "Projects" })).toContainText(
    "No scripts yet",
  );
  await expect(serverLine(page)).toHaveText("Server running");
  // open on the first visit to the Library
  const tour = tourTab(page);
  // "History" among them
  for (const group of TOUR_GROUPS)
    await expect(
      tour.getByRole("heading", { name: group, exact: true }),
    ).toBeVisible();
  // a group with no scenario is its heading alone
  await expect(tour.getByText("Not in this build yet")).toHaveCount(0);
});

test("the chooser shows placeholder rows while the people load, and never a loading sentence", async ({
  page,
}) => {
  await page.route("**/api/sign-in", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto("/choose");
  await expect(page.locator("[data-placeholder]")).toHaveCount(6);
  await expect(page.getByText("Loading…")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Dana Reyes/ })).toBeVisible();
  await expect(page.locator("[data-placeholder]")).toHaveCount(0);
});

test("the heading is focused on a first load of each screen", async ({
  page,
}) => {
  await page.goto("/choose");
  await expect(
    page.getByRole("heading", { name: "Choose who you are" }),
  ).toBeFocused();
  // a first load of `/` with a person already in the tab
  await signedInAs(page, "leo");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Library" })).toBeFocused();
  await page.getByRole("button", { name: "Person: Leo Marsh" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose who you are" }),
  ).toBeFocused();
  const chosen = page.getByRole("button", {
    name: "Leo Marsh Executive, reader and commenter Chosen",
    exact: true,
  });
  // marked in words as well as for assistive technology
  await expect(chosen).toHaveAttribute("aria-current", "true");
  // on the tab's person only
  await expect(page.getByText("Chosen", { exact: true })).toHaveCount(1);
  await page.getByRole("link", { name: "‹ Library" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeFocused();
});

test("two tabs are two people", async ({ context }) => {
  const a = await context.newPage();
  await a.goto("/");
  await a.getByRole("button", { name: /^Dana Reyes/ }).click();
  const b = await context.newPage();
  await b.goto("/");
  await expect(
    b.getByRole("heading", { name: "Choose who you are" }),
  ).toBeVisible();
  await b.getByRole("button", { name: /^Sam Okafor/ }).click();
  await a.reload();
  await expect(
    a.getByRole("button", { name: "Person: Dana Reyes" }),
  ).toBeVisible();
  await expect(
    b.getByRole("button", { name: "Person: Sam Okafor" }),
  ).toBeVisible();
});

test("switching person marks the chosen one and comes back to the same place", async ({
  page,
}) => {
  await signedInAs(page, "leo");
  await page.getByRole("button", { name: "Person: Leo Marsh" }).click();
  await expect(page).toHaveURL(/\/choose\?next=%2F$/);
  await expect(
    page.getByRole("button", {
      name: "Leo Marsh Executive, reader and commenter Chosen",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "true");
  await expect(page.locator("[aria-current]")).toHaveCount(1);
  await expect(page.getByText("Chosen", { exact: true })).toHaveCount(1);
  await page.getByRole("link", { name: "‹ Library" }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Person: Leo Marsh" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Person: Leo Marsh" }).click();
  await page.getByRole("button", { name: /^Ana Costa/ }).click();
  await expect(page.getByRole("heading", { name: "Library" })).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Person: Ana Costa" }),
  ).toBeVisible();
});

test("choosing You signs nobody in", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/sign-in")
      posts.push(r.url());
  });
  await page.goto("/choose");
  await page
    .getByRole("button", {
      name: "You A new person with an empty workspace",
      exact: true,
    })
    .click();
  await expect(page.getByRole("button", { name: "Person: You" })).toBeVisible();
  // no session is asked for
  expect(posts).toEqual([]);
  expect(
    await page.evaluate(() => sessionStorage.getItem("manent.demo.session")),
  ).toBe('{"token":null,"userId":"you","name":"You"}');
});

test("a script's address opened in a new tab asks who you are, then opens the script, and a reload keeps each", async ({
  page,
  browser,
}) => {
  const docId = crypto.randomUUID();
  const address = `/s/${docId}`;
  await openMadeScript(page, "dana", docId);
  const context = await browser.newContext({ serviceWorkers: "block" });
  try {
    const tab = await context.newPage();
    await tab.goto(address);
    const chooser = `/choose?next=${encodeURIComponent(address)}`;
    await expect(tab).toHaveURL(chooser);
    const heading = tab.getByRole("heading", { name: "Choose who you are" });
    await expect(heading).toBeFocused();
    await tab.reload();
    await expect(tab).toHaveURL(chooser);
    await expect(heading).toBeFocused();
    await tab.getByRole("button", { name: /^Dana Reyes/ }).click();
    await expect(tab).toHaveURL(address);
    const title = "Untitled script — Dana Reyes — Manent demo";
    await expect(tab).toHaveTitle(title);
    await tab.reload();
    await expect(tab).toHaveTitle(title);
  } finally {
    await context.close();
  }
});

test("?person= signs a tab in and leaves the address as it was", async ({
  page,
}) => {
  await page.goto("/choose");
  const before = await page.evaluate(() => history.length);
  await page.goto("/?person=sam&x=1#top");
  await expect(
    page.getByRole("button", { name: "Person: Sam Okafor" }),
  ).toBeVisible();
  const url = new URL(page.url());
  // only `person` is dropped
  expect([url.pathname, url.search, url.hash]).toEqual(["/", "?x=1", "#top"]);
  // the visit itself, and no extra entry
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
});

test("?person= with an unknown id, or with the server out of reach, leaves the tab as it was", async ({
  page,
}) => {
  await signedInAs(page, "leo");
  await page.goto("/?person=nobody");
  await expect(
    page.getByRole("button", { name: "Person: Leo Marsh" }),
  ).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
  await page.route("**/api/sign-in", (route) => route.abort());
  await page.goto("/?person=sam");
  await expect(
    page.getByRole("button", { name: "Person: Leo Marsh" }),
  ).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
});

test("a reload restores the person, even while /api/me cannot be reached", async ({
  page,
}) => {
  await signedInAs(page, "leo");
  await page.route("**/api/me", (route) => route.abort());
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Person: Leo Marsh" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
});

test("a session the server no longer accepts lands on the chooser", async ({
  page,
}) => {
  await page.addInitScript(
    storedPerson({ token: "not-a-session", userId: "leo", name: "Leo Marsh" }),
  );
  // /api/me answers 401
  await page.goto("/");
  await expect(page).toHaveURL(/\/choose\?next=%2F$/);
  await expect(
    page.getByRole("button", { name: "Person", exact: true }),
  ).toBeVisible();
});

test("the status line appears empty, then speaks", async ({ page }) => {
  await page.route(
    `http://127.0.0.1:${E2E_CONTROL_PORT}/status`,
    async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    },
  );
  await signedInAs(page, "leo");
  // rendered as soon as a control exists
  await expect(serverLine(page)).toHaveText("");
  await expect(serverLine(page)).toHaveText("Server running");
});

test("stopping and starting the server keeps the tab's person, and two tabs agree", async ({
  page,
  context,
  request,
}) => {
  const { control } = (await (
    await request.get("/api/demo")
  ).json()) as DemoResponse;
  // the chooser has loaded its people once
  await page.goto("/");
  await page.getByRole("button", { name: leo() }).click();
  const other = await context.newPage();
  await signedInAs(other, "dana");
  // the other tab learns of the server's control from the server: it must have it before the server stops
  await expect(serverLine(other)).toHaveText("Server running");
  // a request from the demo's port to its control port: it passes CORS or this line cannot work
  await page.getByRole("button", { name: "Stop the server" }).click();
  try {
    await expect(serverLine(page)).toHaveText(
      "Server stopped. Start it before reloading this tab.",
    );
    await expect(
      page.getByRole("button", { name: "Stop the server" }),
    ).toHaveCount(0);
    // within its 2 s poll
    await expect(serverLine(other)).toHaveText(
      "Server stopped. Start it before reloading this tab.",
    );
    await expect(
      other.getByRole("button", { name: "Start the server" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Person: Leo Marsh" }).click();
    await page.getByRole("button", { name: /^Ana Costa/ }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "Can't reach Manent. Start the server, then choose again.",
    );
    // still listed
    for (const p of DEMO_PEOPLE)
      await expect(
        page.getByRole("button", { name: new RegExp(`^${p.name}`) }),
      ).toBeVisible();
    await page.getByRole("button", { name: "Start the server" }).click();
    await expect(serverLine(page)).toHaveText("Server running");
    await expect(
      other.getByRole("button", { name: "Stop the server" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Person: Leo Marsh" }),
    ).toBeVisible();
  } finally {
    // the tests after this one need the server, whatever this one found
    const started = await request.post(`${control!.url}/start-server`, {
      headers: { Authorization: `Bearer ${control!.token}` },
    });
    expect(await started.json()).toEqual({ server: "running" });
  }
});

test("a reset drops what the tab had cached from the old seed", async ({
  page,
  request,
}) => {
  await page.goto("/choose");
  await expect(page.getByRole("button", { name: /^Dana Reyes/ })).toBeVisible();
  const { control } = (await (
    await request.get("/api/demo")
  ).json()) as DemoResponse;
  // the choices are fetched afresh
  const again = page.waitForRequest("**/api/sign-in");
  await request.post(`${control!.url}/reset`, {
    headers: { Authorization: `Bearer ${control!.token}` },
  });
  await again;
  // the bar's own queries were not dropped
  await expect(serverLine(page)).toHaveText("Server running");
});

test("outside demo mode there is no demo bar and no Tour", async ({ page }) => {
  await page.route("**/api/demo", (route) =>
    route.fulfill({ status: 404, json: { error: "not_found" } }),
  );
  await signedInAs(page, "leo");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Demo" })).toHaveCount(0);
  await expect(tourTab(page)).toHaveCount(0);
});

test("a deep link loads its assets through absolute paths", async ({
  page,
}) => {
  const assets: string[] = [];
  const notOk: string[] = [];
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith("/chunk-")) assets.push(path);
    if (r.status() >= 400 && !path.startsWith("/api/")) notOk.push(path);
  });
  await page.goto("/s/01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd/v/7");
  // the app started, three levels deep
  await expect(page.getByRole("region", { name: "Demo" })).toBeVisible();
  expect(assets.some((p) => p.endsWith(".js"))).toBe(true);
  expect(assets.some((p) => p.endsWith(".css"))).toBe(true);
  // nothing was asked for under /s/…/
  expect(notOk).toEqual([]);
});
