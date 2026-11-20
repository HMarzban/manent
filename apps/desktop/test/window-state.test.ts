import { afterAll, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeClock } from "@manent/server-core/testing";
import {
  WINDOW_ROLES,
  createWindowStateWriter,
  readWindowState,
} from "../src/window-state.ts";
import type { WindowRecord } from "../src/window-state.ts";

const made: string[] = [];

async function stateFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "manent-window-state-"));
  made.push(dir);
  return join(dir, "window-state.json");
}

afterAll(async () => {
  await Promise.all(made.map((dir) => rm(dir, { recursive: true })));
});

const FRAME = { x: 100, y: 80, width: 1280, height: 800 };

test("window state is saved half a second after the last change, per role", async () => {
  const path = await stateFile();
  const time = fakeClock();
  const writer = createWindowStateWriter({
    path,
    clock: time.clock,
    delayMs: 500,
  });
  writer.update("main", { frame: { ...FRAME, x: 0 } });
  time.advance(200);
  writer.update("main", { frame: { ...FRAME, x: 50 } });
  time.advance(200);
  writer.update("main", { frame: FRAME });
  expect(existsSync(path)).toBe(false);
  time.advance(499);
  expect(existsSync(path)).toBe(false);
  time.advance(1);
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
    v: 1,
    roles: {
      main: {
        frame: FRAME,
        maximised: false,
        fullScreen: false,
        firstPaint: [],
      },
    },
  });
  expect(existsSync(`${path}.tmp`)).toBe(false);
});

test("a closing window's state is saved at once, beside the other roles'", async () => {
  const path = await stateFile();
  const room: WindowRecord = {
    frame: FRAME,
    maximised: true,
    fullScreen: false,
    firstPaint: [["a", "data-theme", "dark"]],
  };
  writeFileSync(path, JSON.stringify({ v: 1, roles: { room } }));
  const writer = createWindowStateWriter({
    path,
    clock: fakeClock().clock,
    delayMs: 500,
  });
  writer.update("main", { fullScreen: true });
  writer.flush();
  expect(readWindowState(path)).toEqual({
    v: 1,
    roles: {
      room,
      main: { frame: null, maximised: false, fullScreen: true, firstPaint: [] },
    },
  });
});

test("a damaged state file is read as empty", async () => {
  const path = await stateFile();
  expect(readWindowState(path)).toEqual({ v: 1, roles: {} });
  const damaged = [
    "{",
    "[]",
    JSON.stringify({ v: 2, roles: {} }),
    JSON.stringify({ v: 1, roles: [] }),
    JSON.stringify({ v: 1, roles: { main: { ...FRAME } } }),
    JSON.stringify({
      v: 1,
      roles: {
        main: {
          frame: { ...FRAME, width: "1280" },
          maximised: false,
          fullScreen: false,
          firstPaint: [],
        },
      },
    }),
    JSON.stringify({
      v: 1,
      roles: {
        main: {
          frame: null,
          maximised: false,
          fullScreen: false,
          firstPaint: [["b", "data-theme", "dark"]],
        },
      },
    }),
  ];
  for (const text of damaged) {
    writeFileSync(path, text);
    expect(readWindowState(path)).toEqual({ v: 1, roles: {} });
  }
});

test("a state file that cannot be written leaves the window as it is", async () => {
  const blocker = await stateFile();
  writeFileSync(blocker, "");
  const path = join(blocker, "window-state.json");
  const writer = createWindowStateWriter({
    path,
    clock: fakeClock().clock,
    delayMs: 500,
  });
  writer.update("main", { maximised: true });
  writer.flush();
  expect(existsSync(path)).toBe(false);
});

test("the stored window roles are fixed", () => {
  expect(WINDOW_ROLES).toEqual(["main", "room", "prompter"]);
});
