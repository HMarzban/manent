// Tabs of one browser: one connection per person, a leader that can close, You signing in, and one passage settled once.
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  SECOND_SCENE_ACTION,
  SPEECH,
  asPerson,
  newDevice,
  pageText,
  personIn,
  readStatus,
  setConnection,
  sharedScript,
  statusButton,
  syncHook,
  test,
  typeIn,
} from "./support.ts";

// two people in browsers of their own, each signing in, take longer than the default
test.describe.configure({ timeout: 120_000 });

/** The sockets `page` holds open. */
const connections = async (page: Page): Promise<number> =>
  Number(await syncHook(page, "connections"));

/** Of two tabs of one person, the one holding their connection, once exactly one does. */
async function leaderOf(tabs: readonly [Page, Page]): Promise<Page> {
  await expect
    .poll(async () => (await Promise.all(tabs.map(connections))).toSorted())
    .toEqual([0, 1]);
  return (await connections(tabs[0])) === 1 ? tabs[0] : tabs[1];
}

test("two tabs as Dana share one connection; two tabs as Dana and Sam have one each", async ({
  browser,
}) => {
  const context = await newDevice(browser);
  const dana = [
    await personIn(context, "dana"),
    await personIn(context, "dana"),
  ];
  const sam = await personIn(context, "sam");
  await expect
    .poll(async () => [
      (await connections(dana[0]!)) + (await connections(dana[1]!)),
      await connections(sam),
    ])
    .toEqual([1, 1]);
});

test("the leader tab closes and the other carries on with nothing lost", async ({
  browser,
}) => {
  const [first, sam] = [
    await asPerson(browser, "dana"),
    await asPerson(browser, "sam"),
  ];
  const docId = await sharedScript(first, sam);
  const second = await personIn(first.context(), "dana", `/s/${docId}`);
  await expect.poll(() => readStatus(second)).toBe("Saved · Synced");
  await typeIn(first, SPEECH, " by morning");
  await typeIn(second, SECOND_SCENE_ACTION, " A horn sounds twice.");
  await expect.poll(() => readStatus(first)).toBe("Saved · Synced");
  await expect.poll(() => readStatus(second)).toBe("Saved · Synced");
  const leader = await leaderOf([first, second]);
  const other = leader === first ? second : first;
  await leader.close();
  await typeIn(other, SPEECH, ", we hope");
  await expect.poll(() => connections(other)).toBe(1);
  // the other tab takes the lead and connects before it sends
  await expect
    .poll(() => pageText(sam), { timeout: 30_000 })
    .toBe(
      [
        "INT. HARBOUR OFFICE - NIGHT",
        "Rain runs down the window.",
        "MARA",
        "The boats are in by morning, we hope",
        "EXT. PIER - DAWN",
        "Gulls wheel over the water. A horn sounds twice.",
      ].join("\n"),
    );
  await expect.poll(() => readStatus(other)).toBe("Saved · Synced");
});

test("You writes, signs in to sync, and the status becomes Synced", async ({
  browser,
}) => {
  const page = await personIn(await newDevice(browser), "you");
  await page
    .locator('[data-region="title_bar"]')
    .getByRole("button", { name: "New script", exact: true })
    .click();
  await expect(page).toHaveURL(/\/s\//);
  await expect(
    page.locator("[data-region='page'] [contenteditable='true']"),
  ).toBeFocused();
  await page.keyboard.type("INT. KITCHEN - NIGHT");
  await expect
    .poll(() => readStatus(page))
    .toBe("Saved · Only in this browser — not backed up");
  await statusButton(page).click();
  await page.getByRole("button", { name: "Sign in to sync" }).click();
  await expect
    .poll(() => readStatus(page), { timeout: 20_000 })
    .toBe("Saved · Synced");
  expect(await pageText(page)).toBe("INT. KITCHEN - NIGHT");
});

test("two tabs as Sam settle one passage once", async ({ browser }) => {
  const [dana, first] = [
    await asPerson(browser, "dana"),
    await asPerson(browser, "sam"),
  ];
  const docId = await sharedScript(dana, first);
  const second = await personIn(first.context(), "sam", `/s/${docId}`);
  await expect.poll(() => readStatus(second)).toBe("Saved · Synced");
  // the Connection acts on the leader's link, which the other tab follows
  const leader = await leaderOf([first, second]);
  const other = leader === first ? second : first;
  await setConnection(leader, "offline");
  await typeIn(leader, SPEECH, " and the tide");
  await expect
    .poll(() => readStatus(leader))
    .toBe("Saved · Offline, 1 waiting");
  await typeIn(dana, SPEECH, " before the storm");
  await expect.poll(() => readStatus(dana)).toBe("Saved · Synced");
  await setConnection(leader, "online");
  for (const tab of [first, second]) {
    await expect
      .poll(() => readStatus(tab))
      .toBe("Saved · Synced, 1 to review");
    await statusButton(tab).click();
    await tab
      .getByRole("dialog")
      .getByRole("button", { name: "Review", exact: true })
      .click();
    await expect(tab.getByText("you and Dana both changed this")).toBeVisible();
  }
  await other.getByRole("button", { name: "Use mine" }).click();
  await expect(leader.getByText("you and Dana both changed this")).toHaveCount(
    0,
  );
  for (const tab of [first, second])
    await expect.poll(() => readStatus(tab)).toBe("Saved · Synced");
  await expect
    .poll(() => pageText(dana))
    .toContain("The boats are in and the tide\n");
  expect((await pageText(dana)).split(" and the tide").length - 1).toBe(1);
  expect(await pageText(dana)).not.toContain("before the storm");
});
