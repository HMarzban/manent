import { expect, test } from "bun:test";
import {
  readCachedFeed,
  removeCachedFeed,
  writeCachedFeed,
} from "../src/screens/present/prompter/prompter-storage.ts";
import { MemoryStorage } from "./services.fixtures.ts";

const RUNDOWN_ID = "00000000-0000-4000-8000-000000000099";
const FEED_KEY = `manent.prompter.feed.${RUNDOWN_ID}`;

test("cached prompter feeds keep valid nullable numbers, reject malformed ones and clear on removal", () => {
  const storage = new MemoryStorage();
  const valid = {
    v: 1 as const,
    runOrder: [
      {
        rowId: "row-1",
        kind: "header" as const,
        number: null,
        title: "Block A",
        storyId: null,
        durationMs: null,
      },
      {
        rowId: "row-2",
        kind: "story" as const,
        number: 1,
        title: "Lead",
        storyId: "story-1",
        durationMs: 45_000,
      },
    ],
    stories: [],
    lastReceivedAt: null,
  };

  writeCachedFeed(storage, RUNDOWN_ID, valid);
  expect(readCachedFeed(storage, RUNDOWN_ID)).toEqual(valid);

  removeCachedFeed(storage, RUNDOWN_ID);
  expect(storage.getItem(FEED_KEY)).toBeNull();
  expect(readCachedFeed(storage, RUNDOWN_ID)).toBeNull();

  storage.setItem(
    FEED_KEY,
    JSON.stringify({ ...valid, lastReceivedAt: "not-a-number" }),
  );
  expect(readCachedFeed(storage, RUNDOWN_ID)).toBeNull();

  storage.setItem(
    FEED_KEY,
    JSON.stringify({
      ...valid,
      runOrder: [{ ...valid.runOrder[0], durationMs: "bad" }],
    }),
  );
  expect(readCachedFeed(storage, RUNDOWN_ID)).toBeNull();

  const removedKeys: string[] = [];
  const throwingStorage = new MemoryStorage();
  throwingStorage.removeItem = (key: string): void => {
    removedKeys.push(key);
    throw new Error("storage refuses removal");
  };
  removeCachedFeed(throwingStorage, RUNDOWN_ID);
  expect(removedKeys).toEqual([FEED_KEY]);
});
