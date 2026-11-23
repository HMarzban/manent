// The ways the offline tests bring a page to a sentence: each a person's steps in the demo, or a fact laid over the
// real sync through the test build's hooks.
import { expect } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { committedOnDevice } from "../support/tour.ts";
import {
  SECOND_SCENE_ACTION,
  SPEECH,
  asPerson,
  deleteSecondScene,
  demoControl,
  docIdOf,
  message,
  newDevice,
  personIn,
  readStatus,
  renameScript,
  serverTo,
  setConnection,
  sharedScript,
  statusButton,
  syncHook,
  typeIn,
  whenDone,
  writeScript,
} from "./support.ts";

export const TITLE = "The Night Ferry";
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
/** Today as the messages write a day: "23 Nov". */
export const today = (): string => {
  const now = new Date();
  return `${now.getDate()} ${MONTHS[now.getMonth()]}`;
};

/** Lays `fact` over the real facts of the script open on `page`. */
export const inject = (page: Page, fact: object): Promise<unknown> =>
  syncHook(page, "inject", docIdOf(page), fact);

/** Dana on a script of her own, synced. */
export async function synced(browser: Browser): Promise<Page> {
  const page = await asPerson(browser, "dana");
  await writeScript(page);
  return page;
}

/** You, who has never signed in, in a new script of one line. */
export async function yourNewScript(browser: Browser): Promise<Page> {
  const page = await asPerson(browser, "you");
  await page
    .locator('[data-region="title_bar"]')
    .getByRole("button", { name: "New script", exact: true })
    .click();
  await expect(page).toHaveURL(/\/s\//);
  await expect(
    page.locator("[data-region='page'] [contenteditable='true']"),
  ).toBeFocused();
  await page.keyboard.type("INT. KITCHEN - NIGHT");
  return page;
}

/** Stops the server from the demo bar, as a person does, and starts it again when the test ends. */
export async function stopFromBar(page: Page): Promise<void> {
  await demoControl(page.request);
  await page
    .getByRole("region", { name: "Demo" })
    .getByRole("button", { name: "Stop the server" })
    .click();
  whenDone(() => serverTo(page.request, "running"));
  await expect.poll(() => readStatus(page)).toBe("Saved · Can't reach Manent");
}

/** Dana's script, named, with the server stopped and `lines` of her changes waiting: one in the speech, then one more. */
export async function waiting(browser: Browser, lines: 1 | 2): Promise<Page> {
  const page = await synced(browser);
  await renameScript(page, TITLE);
  await expect.poll(() => readStatus(page)).toBe("Saved · Synced");
  await stopFromBar(page);
  await typeIn(page, SPEECH, " tonight");
  if (lines === 2) await typeIn(page, SECOND_SCENE_ACTION, " Then silence.");
  await expect
    .poll(() => readStatus(page))
    .toBe(`Saved · Can't reach Manent, ${lines} waiting`);
  return page;
}

/** Dana offline since `at` with one change waiting, then `hours` later on the same page. */
export async function offlineFor(
  browser: Browser,
  at: Date,
  hours: number,
): Promise<Page> {
  const context = await newDevice(browser);
  await context.clock.install({ time: new Date(at.getTime() - 3_600_000) });
  const page = await personIn(context, "dana");
  await writeScript(page);
  await context.clock.setSystemTime(at);
  await setConnection(page, "offline");
  await typeIn(page, SPEECH, " tonight");
  await expect.poll(() => readStatus(page)).toBe("Saved · Offline, 1 waiting");
  await context.clock.fastForward(hours * 3_600_000);
  return page;
}

/**
 * Sam offline rewrites the speech `other` rewrites online on a device of their own, then comes back; resolves to Sam's
 * page once the status counts the passage and the Sync centre's Review has opened To review.
 */
async function overlapping(browser: Browser, other: string): Promise<Page> {
  const [them, sam] = [
    await asPerson(browser, other),
    await asPerson(browser, "sam"),
  ];
  await sharedScript(them, sam);
  await setConnection(sam, "offline");
  await typeIn(sam, SPEECH, " and the tide");
  await expect.poll(() => readStatus(sam)).toBe("Saved · Offline, 1 waiting");
  await typeIn(them, SPEECH, " before the storm");
  await expect.poll(() => readStatus(them)).toBe("Saved · Synced");
  await setConnection(sam, "online");
  await expect.poll(() => readStatus(sam)).toBe("Saved · Synced, 1 to review");
  // the receipt stays until it is dismissed, and the next message waits behind it
  await message(sam, "1 change synced")
    .getByRole("button", { name: "Dismiss" })
    .click();
  await statusButton(sam).click();
  await sam
    .getByRole("dialog")
    .getByRole("button", { name: "Review", exact: true })
    .click();
  return sam;
}

/** The passage Sam rewrote offline, rewritten online by Dana. */
export const overlapped = (browser: Browser): Promise<Page> =>
  overlapping(browser, "dana");

/** The passage Sam rewrote offline, rewritten online by Sam himself on his other device. */
export const overlappedOnHisOtherDevice = (browser: Browser): Promise<Page> =>
  overlapping(browser, "sam");

/** Sam offline types into the scene Dana deletes, then comes back; resolves once To review lists the Recovered text. */
export async function recovered(browser: Browser): Promise<Page> {
  const [dana, sam] = [
    await asPerson(browser, "dana"),
    await asPerson(browser, "sam"),
  ];
  await sharedScript(dana, sam);
  await setConnection(sam, "offline");
  await typeIn(sam, SECOND_SCENE_ACTION, " The kettle starts to sing.");
  await expect.poll(() => readStatus(sam)).toBe("Saved · Offline, 1 waiting");
  await deleteSecondScene(dana);
  await expect.poll(() => readStatus(dana)).toBe("Saved · Synced");
  await setConnection(sam, "online");
  const receipt = message(sam, "kept in Recovered text");
  await receipt.getByRole("button", { name: "Review", exact: true }).click();
  await receipt.getByRole("button", { name: "Dismiss" }).click();
  return sam;
}

/** Sam's changes waiting while Dana deletes the shared script; resolves to Sam's page once he is back online. */
export async function deletedWhileAway(browser: Browser): Promise<Page> {
  const [dana, sam] = [
    await asPerson(browser, "dana"),
    await asPerson(browser, "sam"),
  ];
  const docId = await writeScript(dana);
  await renameScript(dana, TITLE);
  await sam.goto(`/s/${docId}`);
  await expect.poll(() => readStatus(sam)).toBe("Saved · Synced");
  await setConnection(sam, "offline");
  await typeIn(sam, SPEECH, " and the tide");
  await typeIn(sam, SECOND_SCENE_ACTION, " A horn sounds.");
  await expect.poll(() => readStatus(sam)).toBe("Saved · Offline, 2 waiting");
  const token = await dana.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("manent.demo.session") ?? "{}").token,
  );
  const removed = await dana.request.post("/api/docs/remove", {
    headers: { Authorization: `Bearer ${String(token)}` },
    data: { docId },
  });
  expect(await removed.json()).toEqual({ removed: true });
  await setConnection(sam, "online");
  return sam;
}

/** Sam offline with two changes waiting while Dana has the server reorganise the script, then Sam back. */
export async function rebuiltAway(browser: Browser): Promise<Page> {
  const [dana, sam] = [
    await asPerson(browser, "dana"),
    await asPerson(browser, "sam"),
  ];
  await sharedScript(dana, sam);
  await setConnection(sam, "offline");
  await typeIn(sam, SPEECH, " and the tide");
  await typeIn(sam, SECOND_SCENE_ACTION, " A horn sounds.");
  await expect.poll(() => readStatus(sam)).toBe("Saved · Offline, 2 waiting");
  await reorganise(dana);
  await setConnection(sam, "online");
  return sam;
}

/** Reorganises the open script from the demo bar, and waits until the page says the server has done it. */
export async function reorganise(page: Page): Promise<void> {
  await page
    .getByRole("region", { name: "Demo" })
    .getByRole("button", { name: "Reorganise" })
    .click();
  await expect(
    message(page, "Manent reorganised how this script is stored."),
  ).toBeVisible({ timeout: 20_000 });
}

/** `reach`, then `choice` chosen in To review on the page it reached. */
export function choose(
  reach: (browser: Browser) => Promise<Page>,
  choice: string,
): (browser: Browser) => Promise<Page> {
  return async (browser) => {
    const page = await reach(browser);
    await page.getByRole("button", { name: choice, exact: true }).click();
    return page;
  };
}

/** Dana's open script after the page ended without leaving, two changes after it was opened: its pagehide is never heard. */
export async function crashed(browser: Browser): Promise<Page> {
  const context = await newDevice(browser);
  await context.addInitScript(() => {
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (
      this: EventTarget,
      ...args: Parameters<EventTarget["addEventListener"]>
    ) {
      if (args[0] !== "pagehide") Reflect.apply(add, this, args);
    };
  });
  const page = await personIn(context, "dana");
  const docId = await writeScript(page);
  // the changes counted are those since the script was last opened: it is left and opened again
  await page.getByRole("button", { name: "‹ Library" }).click();
  await page.goto(`/s/${docId}`);
  await typeIn(page, SPEECH, " tonight");
  await typeIn(page, SECOND_SCENE_ACTION, " Then silence.");
  // synced, so the reload sends nothing and its receipt says nothing before the message
  await expect.poll(() => readStatus(page)).toBe("Saved · Synced");
  await committedOnDevice(page, "dana");
  await page.reload();
  return page;
}
