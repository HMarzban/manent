// The document frame in a browser: the status, the title bar on a narrow window, and signing in from the Sync centre.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { makeScript } from "../support/made-script.ts";
import { closeFirstTour, signedInAs } from "../support/tour.ts";

const DOC_ID = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const DOC = `/s/${DOC_ID}`;
const NEW_SCRIPT = "Saved · Only in this browser — not backed up";

/** Lays `facts` over the open document's status, through the test build's hook. */
async function setStatus(
  page: Page,
  facts: Readonly<Record<string, unknown>>,
): Promise<void> {
  await page.evaluate((patch) => {
    const hook: unknown = Reflect.get(window, "__manent");
    const set: unknown =
      typeof hook === "object" && hook !== null
        ? Reflect.get(hook, "setStatus")
        : null;
    if (typeof set !== "function")
      throw new Error("the test build's status hook is missing");
    set(patch);
  }, facts);
}

/** Whether every word of `locator` is drawn: nothing cut off inside it, and nothing past the window's edges. */
const fits = async (locator: Locator): Promise<boolean> =>
  locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return (
      element.scrollWidth <= element.clientWidth &&
      box.left >= 0 &&
      box.right <= window.innerWidth
    );
  });

const statusButton = (page: Page): Locator =>
  page.getByRole("button", { name: /^Saved/ });

test("the status never moves while its words change, and its button fits them", async ({
  page,
}) => {
  await signedInAs(page, "you", DOC);
  const status = statusButton(page);
  await expect(status).toHaveAccessibleName(NEW_SCRIPT);
  // the band the button sits in
  const band = status.locator("xpath=..");
  // the slots' row, the device slot's holder and the slot, the middle dot, then the server slot's holder
  const server = status.locator("span").nth(4);
  const boxes: ({ x: number; y: number; width: number } | null)[] = [];
  // from the end of the server slot's words to the end of the button: its padding and its edge alone
  const trails: number[] = [];
  // You has no session, so under the new script's words the source says Sign in to sync
  for (const [facts, words] of [
    [{ neverSynced: false, server: "synced" }, "Saved · Synced"],
    [{ server: "syncing", waiting: 3 }, "Saved · Syncing…"],
    [{ network: "offline", waiting: 12 }, "Saved · Offline, 12 waiting"],
    [
      { network: "online", server: "unreachable", waiting: 1212 },
      "Saved · Can't reach Manent, 1,212 waiting",
    ],
    [{ server: "sign_in", waiting: 4 }, "Saved · Sign in to sync, 4 waiting"],
  ] as const) {
    await setStatus(page, facts);
    await expect(status).toHaveAccessibleName(words);
    boxes.push(await band.boundingBox());
    const [button, slot] = [
      await status.boundingBox(),
      await server.boundingBox(),
    ];
    trails.push(
      Math.round(
        (button?.x ?? 0) +
          (button?.width ?? 0) -
          (slot?.x ?? 0) -
          (slot?.width ?? 0),
      ),
    );
  }
  // the band is 368 px wide at Interface size 100 %, whatever the status says
  expect([Math.round(boxes[0]?.width ?? 0), boxes, trails]).toEqual([
    368,
    boxes.map(() => boxes[0]),
    trails.map(() => 9),
  ]);
});

test("the title truncates before the status, which never loses a word", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await page.addInitScript(() =>
    localStorage.setItem(
      "manent.device.you",
      JSON.stringify({ "device.interfaceSize": "200" }),
    ),
  );
  // a script the Library makes, which its index holds and so can rename
  await signedInAs(page, "you");
  await page
    .locator('[data-region="title_bar"]')
    .getByRole("button", { name: "New script", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-ui-size", "200");
  const title = "The Lamp Room, ".repeat(8).slice(0, 120);
  await page.getByRole("button", { name: "Untitled script" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Rename" }).fill(title);
  await page.keyboard.press("Enter");
  const shown = page
    .getByRole("heading", { level: 1 })
    .getByRole("button", { name: title });
  await expect(shown).toBeVisible();
  const status = statusButton(page);
  await expect(status).toHaveAccessibleName(NEW_SCRIPT);
  const truncated = await shown
    .locator(".truncate")
    .evaluate((element) => element.scrollWidth > element.clientWidth);
  expect([
    truncated,
    await fits(status),
    await fits(status.locator("span").nth(0)),
    await fits(status.locator("span").nth(2)),
  ]).toEqual([true, true, true, true]);
});

test("Sign in to sync gives You a session and the status follows the source", async ({
  page,
}) => {
  await signedInAs(page, "you", DOC);
  const status = statusButton(page);
  await status.click();
  const signIn = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/sign-in") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in to sync" }).click();
  expect((await signIn).ok()).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = sessionStorage.getItem("manent.demo.session");
        const session: unknown = raw === null ? null : JSON.parse(raw);
        return typeof session === "object" && session !== null
          ? typeof Reflect.get(session, "token")
          : null;
      }),
    )
    .toBe("string");
  await expect(status).toHaveAccessibleName(NEW_SCRIPT);
  // the sync this tab started before the session keeps saying Sign in to sync under the new script's words
  await setStatus(page, { neverSynced: false });
  await expect(status).toHaveAccessibleName("Saved · Sign in to sync");
});

test("opening a panel never moves the page's lines up or down", async ({
  page,
}) => {
  await signedInAs(page, "you");
  // the Tour that You's first launch opens is the demo's; the script is opened without it
  await closeFirstTour(page);
  await makeScript(page, DOC_ID);
  await page.goto(DOC);
  // the page's first line; Fit width scales the page as a panel takes room, and keeps the line where it was
  const line = page.locator("[data-editor-host] .mn-page-view p").first();
  const top = async (): Promise<number | undefined> =>
    (await line.boundingBox())?.y;
  const tops = [await top()];
  for (const panel of ["Side panel", "Left panel"]) {
    await page.getByRole("button", { name: "View" }).click();
    // a panel's item is checked while the panel is open, and carries its key
    await page
      .getByRole("menuitemcheckbox", { name: new RegExp(`^${panel}`) })
      .click();
    await expect(
      page.getByRole("button", { name: `Close ${panel.toLowerCase()}` }),
    ).toBeVisible();
    // a checked item leaves its menu open
    await page.keyboard.press("Escape");
    tops.push(await top());
  }
  // each opening moves the line by at most the pixel that scrolling rounds to
  const moves = tops
    .slice(1)
    .map(
      (at, i) => Math.abs((at ?? Number.NaN) - (tops[i] ?? Number.NaN)) <= 1,
    );
  expect([typeof tops[0], moves]).toEqual(["number", [true, true]]);
});
