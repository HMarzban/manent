import { expect, test } from "bun:test";
import {
  ABOUT_FRAME,
  aboutFrame,
  aboutWindowUrl,
  createAboutWindow,
} from "../src/shell/about-window.ts";
import type { AboutWindowInit } from "../src/shell/about-window.ts";
import type { PresentBrowserWindow } from "../src/shell/present-window.ts";

test("aboutWindowUrl and aboutFrame build the compact About window cleanly", () => {
  expect(aboutWindowUrl("http://127.0.0.1:41234", "tok/1")).toBe(
    "http://127.0.0.1:41234/about?launch=tok%2F1",
  );
  expect(aboutFrame(null)).toEqual({ ...ABOUT_FRAME });
  expect(aboutFrame({ width: 340, height: 400 })).toEqual({
    width: 320,
    height: 360,
  });
});

test("createAboutWindow deduplicates open windows, routes close/minimize and cleans up on close", () => {
  const opened: AboutWindowInit[] = [];
  const calls: string[] = [];
  const closeHandlers: (() => void)[] = [];
  const makeWindow = (): PresentBrowserWindow => ({
    show: () => calls.push("show"),
    activate: () => calls.push("activate"),
    close: () => {
      calls.push("close");
      closeHandlers.pop()?.();
    },
    minimize: () => calls.push("minimize"),
    getFrame: () => ({ x: 0, y: 0, width: 360, height: 484 }),
    setFrame: () => {},
    maximize: () => {},
    isMaximized: () => false,
    setFullScreen: () => {},
    isFullScreen: () => false,
    on(name, handler) {
      if (name === "close") closeHandlers.push(() => handler(undefined));
    },
  });

  const about = createAboutWindow({
    nodeUrl: "http://127.0.0.1:41234",
    launchToken: "abc",
    platform: "darwin",
    openWindow(init) {
      opened.push(init);
      return makeWindow();
    },
  });

  expect(about.handleAction("close")).toBe(false);
  about.open();
  about.open();
  expect(opened.length).toBe(1);
  expect(opened[0]).toMatchObject({
    title: "About Manent",
    titleBarStyle: "hiddenInset",
    styleMask: { Closable: true, Miniaturizable: false, Resizable: false },
    frame: { width: 360, height: 484 },
  });
  expect(calls).toEqual(["show", "activate"]);

  expect(about.handleAction("minimize")).toBe(true);
  expect(about.handleAction("close")).toBe(true);
  expect(calls).toEqual(["show", "activate", "minimize", "close"]);
  expect(about.handleAction("close")).toBe(false);

  about.open();
  expect(opened.length).toBe(2);
  about.close();
  expect(about.handleAction("close")).toBe(false);
});
