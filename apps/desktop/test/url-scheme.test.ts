import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ShellMessage } from "@manent/sync-protocol";
import { createUrlSchemeHandler } from "../src/shell/url-scheme.ts";
import type {
  OpenUrlEvents,
  UrlSchemeWindow,
} from "../src/shell/url-scheme.ts";
import {
  mainWindowUrl,
  parseFileUrl,
  parseManentUrl,
  parseOpenUrl,
  scriptWindowUrl,
} from "../src/url-scheme.ts";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "manent-url-scheme-"));
  tempDirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true })));
});

function makeFakeWindow(): UrlSchemeWindow & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    focus: () => calls.push("focus"),
    navigate: (url) => calls.push(`navigate:${url}`),
  };
}

function makeFakeEvents(): OpenUrlEvents & {
  emit(url: string): void;
  listenerCount(): number;
} {
  const listeners: ((event: unknown) => void)[] = [];
  return {
    on(_name, handler) {
      listeners.push(handler);
    },
    emit(url) {
      for (const listener of listeners) listener({ data: { url } });
    },
    listenerCount: () => listeners.length,
  };
}

const flushMicrotasks = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 10));
};

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

test("parseFileUrl decodes local file:// URLs and rejects invalid or remote URLs", () => {
  expect(parseFileUrl("file:///Users/test/script.fdx")).toBe(
    "/Users/test/script.fdx",
  );
  expect(parseFileUrl("FILE:///Users/test/My%20Script.fountain")).toBe(
    "/Users/test/My Script.fountain",
  );
  expect(parseFileUrl("file://localhost/Users/test/caf%C3%A9.ink")).toBe(
    "/Users/test/café.ink",
  );
  expect(parseFileUrl("file:///Users/test/Draft%20%231.docx")).toBe(
    "/Users/test/Draft #1.docx",
  );

  for (const rejected of [
    "",
    "manent://s/abc-123",
    "https://manent.app/script.fdx",
    "file:",
    "file:///",
    "file:///Users/test/",
    "file://evil.example/Users/test/script.fdx",
    "file:///Users/test/bad%00.fdx",
    "file:///Users/test/bad\n.fdx",
    "file:///Users/test/bad\x7f.fdx",
  ]) {
    expect(parseFileUrl(rejected)).toBeNull();
  }
});

test("parseOpenUrl discriminates manent:// script links and file:// file opens", () => {
  expect(parseOpenUrl("manent://s/abc-123")).toEqual({
    kind: "script",
    path: "/s/abc-123",
  });
  expect(parseOpenUrl("file:///Users/test/pilot.fdx")).toEqual({
    kind: "file",
    path: "/Users/test/pilot.fdx",
  });
  expect(parseOpenUrl("https://example.com")).toBeNull();
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

test("createUrlSchemeHandler queues file:// opens before first_frame and delivers coalesced files_opened after", async () => {
  const dir = await makeTempDir();
  const coldFile = join(dir, "cold.fdx");
  const earlyFile = join(dir, "early.fountain");
  const warmFile = join(dir, "warm.ink");
  const badFile = join(dir, "ignored.zip");
  await Promise.all([
    writeFile(coldFile, "<FinalDraft/>"),
    writeFile(earlyFile, "FADE IN:"),
    writeFile(warmFile, "-> done"),
    writeFile(badFile, "zip"),
  ]);

  const events = makeFakeEvents();
  const handler = createUrlSchemeHandler("darwin", events);
  const window = makeFakeWindow();
  const sent: ShellMessage[] = [];

  // Cold-launch file:// before attach and before first_frame
  events.emit(pathToFileURL(coldFile).href);
  expect(handler.initialUrl("http://127.0.0.1:41234", "tok1")).toBe(
    "http://127.0.0.1:41234/?launch=tok1",
  );

  handler.attach("http://127.0.0.1:41234", window, (msg) => sent.push(msg));
  // File opened after attach, still before first_frame
  events.emit(pathToFileURL(earlyFile).href);
  await flushMicrotasks();
  expect(sent).toEqual([]);
  expect(window.calls).toEqual(["focus"]);

  const waitForSent = async (count: number): Promise<void> => {
    const deadline = Date.now() + 2_000;
    while (sent.length < count && Date.now() < deadline) await Bun.sleep(5);
  };

  // Once first_frame arrives, queued files flush as one files_opened message
  handler.markReady();
  await waitForSent(1);
  expect(sent).toEqual([
    {
      v: 1,
      t: "files_opened",
      files: [
        { name: "cold.fdx", bytes: Buffer.from("<FinalDraft/>").toBase64() },
        { name: "early.fountain", bytes: Buffer.from("FADE IN:").toBase64() },
      ],
      refused: [],
    },
  ]);

  // Warm-launch multi-file drop coalesces into one message and enforces type refusal
  events.emit(pathToFileURL(warmFile).href);
  events.emit(pathToFileURL(badFile).href);
  await waitForSent(2);
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual({
    v: 1,
    t: "files_opened",
    files: [{ name: "warm.ink", bytes: Buffer.from("-> done").toBase64() }],
    refused: [{ name: "ignored.zip", reason: "type" }],
  });

  // Warm-launch manent:// link still navigates and focuses
  events.emit("manent://s/script-42");
  expect(window.calls.at(-2)).toBe(
    "navigate:http://127.0.0.1:41234/s/script-42",
  );
  expect(window.calls.at(-1)).toBe("focus");
});

test("createUrlSchemeHandler is a no-op on non-macOS platforms", () => {
  const events = makeFakeEvents();
  const handler = createUrlSchemeHandler("linux", events);
  expect(events.listenerCount()).toBe(0);
  expect(handler.initialUrl("http://127.0.0.1:41234", "tok1")).toBe(
    "http://127.0.0.1:41234/?launch=tok1",
  );
});
