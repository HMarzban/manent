import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  HTTP_ERROR_CODES,
  VERSION_KINDS,
  isVersionCursor,
} from "../src/index.ts";

const CURSOR_ID = fc.stringMatching(/^[A-Za-z0-9_-]{1,64}$/);

test("the version kinds and the new error code are pinned in their order", () => {
  expect(VERSION_KINDS).toEqual([
    "auto",
    "saved",
    "named",
    "sent",
    "export",
    "device",
    "pre_restore",
    "pre_merge",
    "pre_heal",
    "recovered",
    "revision_baseline",
    "revision_issue",
  ]);
  expect(HTTP_ERROR_CODES[18]).toBe("not_restorable");
  expect(
    ["1700000000000:a1", "x:a1", "1:", "1:a/b", 7].map(isVersionCursor),
  ).toEqual([true, false, false, false, false]);
});

test("a cursor is an instant and an id, and nothing else reads as one", () => {
  expect(
    [
      `1:${"a".repeat(64)}`,
      `1:${"a".repeat(65)}`,
      "1:a1 2:b2",
      "1:a1\n2:b2",
      " 1:a1",
      "-1:a1",
      "1.5:a1",
    ].map(isVersionCursor),
  ).toEqual([true, false, false, false, false, false, false]);
  fc.assert(
    fc.property(fc.nat(), CURSOR_ID, (createdAt, id) =>
      isVersionCursor(`${createdAt}:${id}`),
    ),
    { numRuns: 500 },
  );
  fc.assert(
    fc.property(fc.anything(), fc.string(), (value, text) => {
      const verdict = isVersionCursor(value);
      return (
        (verdict === false || typeof value === "string") &&
        !isVersionCursor(`${text}/:a1`) &&
        !isVersionCursor(`1:a1${text}/`)
      );
    }),
    { numRuns: 500 },
  );
});
