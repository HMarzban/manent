// Two people on one script, one of them offline: what each typed is merged when the other comes back, and what both
// changed, or what could not be placed, is put to review.
import { expect } from "@playwright/test";
import {
  SECOND_SCENE_ACTION,
  SPEECH,
  asPerson,
  deleteSecondScene,
  message,
  pageText,
  readStatus,
  setConnection,
  sharedScript,
  test,
  typeIn,
  writeScript,
} from "./support.ts";

// two people in browsers of their own, each signing in, take longer than the default
test.describe.configure({ timeout: 120_000 });

test("Sam writes offline while Dana edits the same speech; reconnecting merges, counts and lists both wordings", async ({
  browser,
}) => {
  const [dana, sam] = [
    await asPerson(browser, "dana"),
    await asPerson(browser, "sam"),
  ];
  await sharedScript(dana, sam);
  await setConnection(sam, "offline");
  await expect.poll(() => readStatus(sam)).toBe("Saved · Offline");
  await typeIn(sam, SPEECH, " and the tide");
  await expect.poll(() => readStatus(sam)).toBe("Saved · Offline, 1 waiting");
  await typeIn(dana, SPEECH, " before the storm");
  await expect.poll(() => readStatus(dana)).toBe("Saved · Synced");
  await setConnection(sam, "online");
  const receipt = message(sam, "1 change synced · 1 passage overlaps — review");
  await expect(receipt).toBeVisible();
  await expect.poll(() => readStatus(sam)).toBe("Saved · Synced, 1 to review");
  await receipt.getByRole("button", { name: "Review", exact: true }).click();
  await expect(sam.getByText("you and Dana both changed this")).toBeVisible();
  await sam.getByRole("button", { name: "Use Dana's" }).click();
  await expect.poll(() => readStatus(sam)).toBe("Saved · Synced");
  expect(await pageText(sam)).toBe(await pageText(dana));
});

test("text typed offline into a scene someone deleted is kept as Recovered text and can be put back", async ({
  browser,
}) => {
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
  const receipt = message(
    sam,
    "1 could not be placed — kept in Recovered text",
  );
  await expect(receipt).toBeVisible();
  await expect.poll(() => readStatus(sam)).toBe("Saved · Synced, 1 to review");
  await receipt.getByRole("button", { name: "Review", exact: true }).click();
  await expect(sam.getByText("Recovered text from this device")).toBeVisible();
  await sam.getByRole("button", { name: "Use mine" }).click();
  // the receipt stays until it is dismissed, and the next message waits behind it
  await receipt.getByRole("button", { name: "Dismiss" }).click();
  await expect(
    message(sam, "Put the recovered text back in Sc. 1."),
  ).toBeVisible();
  await expect.poll(() => readStatus(sam)).toBe("Saved · Synced");
  await expect.poll(() => pageText(dana)).toBe(await pageText(sam));
  expect(await pageText(sam)).toContain("The kettle starts to sing.");
});

test("slow is still correct, only later", async ({ browser }) => {
  const dana = await asPerson(browser, "dana");
  await writeScript(dana);
  await setConnection(dana, "slow");
  await typeIn(dana, SPEECH, " tonight");
  await expect.poll(() => readStatus(dana)).toBe("Saved · Syncing…");
  // a second and a half each way, then two seconds with nothing waiting
  await expect
    .poll(() => readStatus(dana), { timeout: 20_000 })
    .toBe("Saved · Synced");
  expect(await pageText(dana)).toContain("The boats are in tonight");
});
