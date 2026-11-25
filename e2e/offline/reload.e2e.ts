// What a script keeps across a reload, a closed tab and a long time offline, and what is sent once the link is back.
import { expect } from "@playwright/test";
import { committedOnDevice } from "../support/tour.ts";
import {
  OFFLINE_BLOCKS_WORKER,
  SECOND_SCENE_ACTION,
  SPEECH,
  asPerson,
  goOffline,
  goOnline,
  newDevice,
  pageText,
  personIn,
  readStatus,
  serverTo,
  setConnection,
  sharedScript,
  test,
  typeIn,
  writeScript,
} from "./support.ts";

// two people in browsers of their own, each signing in, take longer than the default
test.describe.configure({ timeout: 120_000 });

const WORDS = ["the", "tide", "comes", "in", "over", "the", "stones"];
/** Two hundred words, as a person might write in one long line. */
const LONG_LINE = Array.from(
  { length: 200 },
  (_, i) => WORDS[i % WORDS.length],
).join(" ");

test("a reload while offline opens the script from the device with every word", async ({
  browser,
  browserName,
}) => {
  const context = await newDevice(browser);
  const page = await personIn(context, "dana");
  await writeScript(page);
  // the shell is served by the worker only once it controls the page
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await goOffline(context, page);
  try {
    // where going offline stops the server, it is stopped already
    if (OFFLINE_BLOCKS_WORKER[browserName])
      await serverTo(page.request, "stopped");
    await typeIn(page, SECOND_SCENE_ACTION, ` ${LONG_LINE}`);
    await expect
      .poll(() => readStatus(page))
      .toBe("Saved · Offline, 1 waiting");
    await committedOnDevice(page, "dana");
    await page.reload();
    await expect.poll(() => pageText(page)).toContain(LONG_LINE);
    await expect
      .poll(() => readStatus(page))
      .toBe("Saved · Offline, 1 waiting");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  } finally {
    if (OFFLINE_BLOCKS_WORKER[browserName])
      await serverTo(page.request, "running");
    await goOnline(context, page);
  }
});

test("a closed tab's changes sync at the next launch without opening the script", async ({
  browser,
}) => {
  const [dana, sam] = [
    await asPerson(browser, "dana"),
    await asPerson(browser, "sam"),
  ];
  await sharedScript(dana, sam);
  await setConnection(sam, "offline");
  await typeIn(sam, SECOND_SCENE_ACTION, " A bell rings out on the water.");
  await expect.poll(() => readStatus(sam)).toBe("Saved · Offline, 1 waiting");
  await committedOnDevice(sam, "sam");
  await sam.close();
  const later = await personIn(sam.context(), "sam");
  await expect
    .poll(() => pageText(dana), { timeout: 30_000 })
    .toContain("Gulls wheel over the water. A bell rings out on the water.");
  // the Library, never the script
  expect(new URL(later.url()).pathname).toBe("/");
});

/** Tuesday 17 November 2026, 14:10 local time, when the device goes offline. */
const TUESDAY_14_10 = new Date(2026, 10, 17, 14, 10);

test("offline since a day ago reads with its day and time", async ({
  browser,
}) => {
  const context = await newDevice(browser);
  await context.clock.install({ time: new Date(2026, 10, 17, 13, 0) });
  const page = await personIn(context, "dana");
  await writeScript(page);
  await context.clock.setSystemTime(TUESDAY_14_10);
  await setConnection(page, "offline");
  await typeIn(page, SPEECH, " tonight");
  await expect.poll(() => readStatus(page)).toBe("Saved · Offline, 1 waiting");
  await context.clock.fastForward("25:00:00");
  await expect
    .poll(() => readStatus(page))
    .toBe("Saved · Offline since Tue 14:10, 1 waiting");
});

test("going offline while changes are on their way keeps them waiting, and they are sent once", async ({
  browser,
}) => {
  const [dana, sam] = [
    await asPerson(browser, "dana"),
    await asPerson(browser, "sam"),
  ];
  await sharedScript(dana, sam);
  await setConnection(sam, "slow");
  await typeIn(sam, SPEECH, " and the tide");
  // well inside the second and a half the push takes to leave
  await setConnection(sam, "offline");
  await expect.poll(() => readStatus(sam)).toBe("Saved · Offline, 1 waiting");
  await setConnection(sam, "online");
  await expect
    .poll(() => readStatus(sam), { timeout: 20_000 })
    .toBe("Saved · Synced");
  await expect
    .poll(async () => (await pageText(dana)).split(" and the tide").length - 1)
    .toBe(1);
});
