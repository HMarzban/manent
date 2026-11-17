import { expect, test } from "bun:test";
import { focusHeading } from "../src/focus.ts";
import { TEXT } from "../src/text.ts";

test("the heading takes focus, and its absence is not a failure", () => {
  let focused = 0;
  expect(
    focusHeading({
      querySelector: (selector) =>
        selector === "h1"
          ? {
              focus: () => {
                focused++;
              },
            }
          : null,
    }),
  ).toBe(true);
  expect(focused).toBe(1);
  expect(focusHeading({ querySelector: () => null })).toBe(false);
});

test("the fixed sentences", () => {
  expect(TEXT).toMatchObject({
    chooseTitle: "Choose who you are",
    chooseHint:
      "Pick anyone. You can switch at any time, and each browser tab can be a different person.",
    chooseUnreachable:
      "Can't reach Manent. Start the server, then choose again.",
    loading: "Loading…",
    current: "Current",
    back: "‹ Back",
    libraryTitle: "Library",
    projects: "Projects",
    libraryEmpty: "No scripts yet",
    tourTitle: "Tour",
    tourEmptyGroup: "Not in this build yet",
    demo: "Demo",
    stopServer: "Stop the server",
    startServer: "Start the server",
  });
});
