import { expect, test } from "bun:test";
import { DRAFTS_WORDS } from "../src/words/drafts.ts";

test("sentHistoryRow prefers directRecipientCount over group-count subtraction when provided", () => {
  expect(
    DRAFTS_WORDS.sentHistoryRow({
      groups: [{ name: "Network", count: 5 }],
      recipientCount: 6,
      directRecipientCount: 2,
      openedCount: 1,
      totalOpens: 1,
      hasLink: false,
    }),
  ).toBe("Sent to Network (5) and 2 people · opened by 1 of 6");

  expect(
    DRAFTS_WORDS.sentHistoryRow({
      groups: [{ name: "Network", count: 5 }],
      recipientCount: 6,
      directRecipientCount: 0,
      openedCount: 0,
      totalOpens: 0,
      hasLink: true,
    }),
  ).toBe("Sent to Network (5) and by link · opened by 0 of 6");

  expect(
    DRAFTS_WORDS.sentHistoryRow({
      groups: [{ name: "Network", count: 4 }],
      recipientCount: 6,
      directRecipientCount: null,
      openedCount: 1,
      totalOpens: 1,
      hasLink: false,
    }),
  ).toBe("Sent to Network (4) and 2 people · opened by 1 of 6");
});
