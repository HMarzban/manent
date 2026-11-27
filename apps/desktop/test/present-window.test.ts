import { afterAll, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeClock } from "@manent/server-core/testing";
import { DEFAULT_FRAME } from "../src/frames.ts";
import type { Frame } from "../src/frames.ts";
import {
  createPresentWindows,
  presentWindowUrl,
} from "../src/shell/present-window.ts";
import type {
  PresentBrowserWindow,
  PresentWindowInit,
} from "../src/shell/present-window.ts";
import {
  createWindowStateWriter,
  readWindowState,
} from "../src/window-state.ts";
import type { WindowRecord } from "../src/window-state.ts";

const DOC_A = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const DOC_B = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce";
const NODE_URL = "http://127.0.0.1:43123";
const TOKEN = "tok+1/2=3";

const made: string[] = [];

async function stateFile(
  initial?: Partial<Record<"main" | "room" | "prompter", WindowRecord>>,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "manent-present-window-"));
  made.push(dir);
  const path = join(dir, "window-state.json");
  if (initial !== undefined)
    writeFileSync(path, JSON.stringify({ v: 1, roles: initial }));
  return path;
}

afterAll(async () => {
  await Promise.all(made.map((dir) => rm(dir, { recursive: true })));
});

interface FakeWindow extends PresentBrowserWindow {
  init: PresentWindowInit;
  events: string[];
  calls: string[];
  emit(name: string): void;
  frame: Frame;
  maximised: boolean;
  fullScreen: boolean;
}

function makeFakeWindow(
  init: PresentWindowInit,
  options: { clampX?: number } = {},
): FakeWindow {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const calls: string[] = [];
  const fake: FakeWindow = {
    init,
    events: [],
    calls,
    frame: {
      x: 200,
      y: 120,
      width: init.frame.width,
      height: init.frame.height,
    },
    maximised: false,
    fullScreen: false,
    show() {
      calls.push("show");
    },
    activate() {
      calls.push("activate");
    },
    close() {
      calls.push("close");
      fake.emit("close");
    },
    getFrame() {
      return { ...fake.frame };
    },
    setFrame(x, y, width, height) {
      calls.push(`setFrame:${x},${y},${width},${height}`);
      fake.frame = {
        x: options.clampX ?? x,
        y,
        width,
        height,
      };
    },
    maximize() {
      calls.push("maximize");
      fake.maximised = true;
    },
    isMaximized() {
      return fake.maximised;
    },
    setFullScreen(fullScreen) {
      calls.push(`setFullScreen:${fullScreen}`);
      fake.fullScreen = fullScreen;
    },
    isFullScreen() {
      return fake.fullScreen;
    },
    on(name, handler) {
      fake.events.push(name);
      const list = listeners.get(name) ?? [];
      list.push(handler);
      listeners.set(name, list);
    },
    emit(name) {
      for (const handler of listeners.get(name) ?? []) handler({});
    },
  };
  return fake;
}

test("presentWindowUrl builds room and prompter addresses with escaped launch and person parameters", () => {
  expect(
    presentWindowUrl({
      nodeUrl: NODE_URL,
      role: "room",
      docId: DOC_A,
      launchToken: TOKEN,
      userId: "sam & co/1",
    }),
  ).toBe(
    `${NODE_URL}/s/${DOC_A}/present?launch=tok%2B1%2F2%3D3&person=sam%20%26%20co%2F1`,
  );

  expect(
    presentWindowUrl({
      nodeUrl: NODE_URL,
      role: "prompter",
      docId: "doc/with space",
      launchToken: "abc",
    }),
  ).toBe(`${NODE_URL}/s/doc%2Fwith%20space/prompter?launch=abc`);

  expect(
    presentWindowUrl({
      nodeUrl: NODE_URL,
      role: "room",
      docId: DOC_A,
      launchToken: "abc",
      userId: "",
    }),
  ).toBe(`${NODE_URL}/s/${DOC_A}/present?launch=abc`);
});

test("createPresentWindows deduplicates by role and docId, focuses open windows, and never holds close", async () => {
  const path = await stateFile();
  const time = fakeClock();
  const windowState = createWindowStateWriter({
    path,
    clock: time.clock,
    delayMs: 500,
  });
  const created: FakeWindow[] = [];
  const present = createPresentWindows({
    nodeUrl: NODE_URL,
    launchToken: "launch-1",
    statePath: path,
    platform: "darwin",
    windowState,
    openWindow: (init) => {
      const win = makeFakeWindow(init);
      created.push(win);
      return win;
    },
  });

  present.open({ role: "room", docId: DOC_A, userId: "sam" });
  present.open({ role: "room", docId: DOC_A, userId: "sam" });
  present.open({ role: "prompter", docId: DOC_A, userId: "sam" });
  present.open({ role: "room", docId: DOC_B });

  expect(created.map((w) => w.init)).toEqual([
    {
      title: "Manent",
      url: `${NODE_URL}/s/${DOC_A}/present?launch=launch-1&person=sam`,
      hidden: false,
      titleBarStyle: "hiddenInset",
      frame: { width: DEFAULT_FRAME.width, height: DEFAULT_FRAME.height },
      renderer: "cef",
    },
    {
      title: "Manent",
      url: `${NODE_URL}/s/${DOC_A}/prompter?launch=launch-1&person=sam`,
      hidden: false,
      titleBarStyle: "hiddenInset",
      frame: { width: DEFAULT_FRAME.width, height: DEFAULT_FRAME.height },
      renderer: "cef",
    },
    {
      title: "Manent",
      url: `${NODE_URL}/s/${DOC_B}/present?launch=launch-1`,
      hidden: false,
      titleBarStyle: "hiddenInset",
      frame: { width: DEFAULT_FRAME.width, height: DEFAULT_FRAME.height },
      renderer: "cef",
    },
  ]);

  // second open for room:DOC_A focused the existing window
  expect(created[0]?.calls).toEqual(["show", "activate"]);
  // no close hold is ever attached
  expect(created[0]?.events).toEqual(["move", "resize", "close"]);

  // closing removes the window so a subsequent open creates a fresh one
  created[0]?.emit("close");
  present.open({ role: "room", docId: DOC_A, userId: "sam" });
  expect(created).toHaveLength(4);

  present.closeAll();
  expect(created.slice(1).map((w) => w.calls.at(-1))).toEqual([
    "close",
    "close",
    "close",
  ]);
});

test("createPresentWindows restores and persists placement per role and falls back to centred when moved", async () => {
  const savedRoom: Frame = { x: 40, y: 60, width: 1000, height: 700 };
  const offScreen: Frame = { x: 9000, y: 60, width: 1000, height: 700 };
  const path = await stateFile({
    room: {
      frame: savedRoom,
      maximised: true,
      fullScreen: false,
      firstPaint: [],
    },
    prompter: {
      frame: offScreen,
      maximised: false,
      fullScreen: true,
      firstPaint: [],
    },
  });
  const time = fakeClock();
  const windowState = createWindowStateWriter({
    path,
    clock: time.clock,
    delayMs: 500,
  });
  const created: FakeWindow[] = [];
  const present = createPresentWindows({
    nodeUrl: NODE_URL,
    launchToken: "launch-2",
    statePath: path,
    platform: "linux",
    windowState,
    openWindow: (init) => {
      const clampX = init.url.includes("/prompter?") ? 0 : undefined;
      const win = makeFakeWindow(init, { clampX });
      created.push(win);
      return win;
    },
  });

  present.open({ role: "room", docId: DOC_A });
  present.open({ role: "prompter", docId: DOC_A });

  expect(created[0]?.init.titleBarStyle).toBe("default");
  expect(created[0]?.frame).toEqual(savedRoom);
  expect(created[0]?.maximised).toBe(true);
  expect(created[0]?.fullScreen).toBe(false);

  // off-screen prompter frame was moved back to centred before applying fullScreen
  expect(created[1]?.calls).toEqual([
    "setFrame:9000,60,1000,700",
    "setFrame:200,120,1280,800",
    "setFullScreen:true",
  ]);

  // moving/resizing saves to that role's record
  const moved: Frame = { x: 120, y: 90, width: 1100, height: 750 };
  created[0]!.frame = moved;
  created[0]!.maximised = false;
  created[0]!.emit("move");
  windowState.flush();

  expect(readWindowState(path).roles.room).toEqual({
    frame: moved,
    maximised: false,
    fullScreen: false,
    firstPaint: [],
  });

  // closing within the debounce window flushes pending placement immediately so reopen restores it
  const movedAgain: Frame = { x: 180, y: 140, width: 1180, height: 790 };
  created[0]!.frame = movedAgain;
  created[0]!.emit("move");
  created[0]!.emit("close");
  present.open({ role: "room", docId: DOC_A });
  expect(created[2]?.frame).toEqual(movedAgain);
});
