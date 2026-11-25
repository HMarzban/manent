import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  HTTP_ERROR_CODES,
  VERSION_KINDS,
  isVersionCursor,
} from "../src/index.ts";
import type { RestoreScopeBody, VersionContent } from "../src/index.ts";

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
    "prompter",
    "pre_hand_in",
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

test("VersionContent accepts optional rundown content and RestoreScopeBody accepts row scope", () => {
  const scriptContent: VersionContent = {
    v: 1,
    blocks: [],
    settings: {},
    schemaVersion: 2,
    engineVersion: 1,
    locks: null,
    authors: {},
  };
  const rundownContent: VersionContent = {
    ...scriptContent,
    rundown: {
      rundown: {
        airDate: "2026-11-26",
        airAt: 1_764_180_000_000,
        windowLeadMs: 3_600_000,
        targetMs: 1_800_000,
      },
      columns: ["number", "story", "presenter", "dur", "prompter"],
      rows: [
        {
          id: "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd",
          order: "V",
          kind: "script",
          cells: {
            story: {
              value: "Top story",
              userId: "ana",
              setAt: 100,
              previous: null,
            },
          },
          docId: "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce",
          blockId: null,
          durationMs: 45_000,
          prompter: {
            state: "on",
            versionId: "v1",
            sentAt: 120,
            sentByUserId: "ana",
          },
          unnumbered: false,
        },
      ],
    },
  };
  const scopes: RestoreScopeBody[] = [
    { kind: "script" },
    { kind: "scene", headingId: "h1" },
    { kind: "row", rowId: "r1" },
  ];
  expect(scriptContent.rundown).toBeUndefined();
  expect(rundownContent.rundown?.rows[0]?.cells.story?.value).toBe("Top story");
  expect(scopes.map((s) => s.kind)).toEqual(["script", "scene", "row"]);
});
