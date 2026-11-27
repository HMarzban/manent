import { expect, test } from "bun:test";
import {
  mainWindowUrl,
  parseManentUrl,
  scriptWindowUrl,
} from "../src/url-scheme.ts";

test("parseManentUrl maps valid manent://s/ script links to safe in-app paths", () => {
  expect(parseManentUrl("manent://s/abc-123")).toBe("/s/abc-123");
  expect(parseManentUrl("MANENT://s/abc-123/v/ver-9")).toBe(
    "/s/abc-123/v/ver-9",
  );
  expect(parseManentUrl("manent://s/abc-123/changes/v1/v2")).toBe(
    "/s/abc-123/changes/v1/v2",
  );
  expect(parseManentUrl("manent://s/abc-123?scene=4#top")).toBe(
    "/s/abc-123?scene=4#top",
  );
});

test("parseManentUrl rejects non-script hosts, traversal segments, backslashes, and control characters", () => {
  for (const rejected of [
    "",
    "manent://settings",
    "manent://r/token-1",
    "manent://s/",
    "manent://s/?foo=1",
    "manent://s//evil",
    "manent://s/abc/../settings",
    "manent://s/abc/def/../other",
    "manent://s/abc/%2e%2e/settings",
    "manent://s/abc/./def",
    "manent://s/abc\\def",
    "manent://s/abc\ndef",
    "manent://s/abc%2fdef",
    "https://manent.app/s/abc",
    "file:///Users/test/script.fdx",
  ]) {
    expect(parseManentUrl(rejected)).toBeNull();
  }
});

test("mainWindowUrl and scriptWindowUrl preserve query parameters alongside launch token", () => {
  expect(mainWindowUrl("http://127.0.0.1:41234", "tok1", null)).toBe(
    "http://127.0.0.1:41234/?launch=tok1",
  );
  expect(
    mainWindowUrl("http://127.0.0.1:41234", "tok1", "/s/abc-123?scene=4"),
  ).toBe("http://127.0.0.1:41234/s/abc-123?scene=4&launch=tok1");
  expect(scriptWindowUrl("http://127.0.0.1:41234", "/s/abc-123/v/v2")).toBe(
    "http://127.0.0.1:41234/s/abc-123/v/v2",
  );
  expect(
    scriptWindowUrl(
      "http://127.0.0.1:41234",
      "/s/abc-123?launch=stale-token&scene=4#top",
    ),
  ).toBe("http://127.0.0.1:41234/s/abc-123?scene=4#top");
});
