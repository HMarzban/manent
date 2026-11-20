import { expect, test } from "bun:test";
import type { DesktopGlobal } from "@manent/sync-protocol";
import { bootScript } from "../src/index.ts";

const GLOBAL: DesktopGlobal = {
  v: 1,
  platform: "mac",
  version: "0.1.0",
  channel: "canary",
  dataDir: "/Users/sam/Library/Application Support/Manent",
};

interface FakeWindow {
  manentDesktop?: unknown;
  sessionStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
}

function memoryStorage(): FakeWindow["sessionStorage"] {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

// The script runs as a page would run it, against a stub window.
function runInFakeWindow(
  src: string,
  sessionStorage = memoryStorage(),
): FakeWindow {
  const win: FakeWindow = { sessionStorage };
  new Function("window", src)(win);
  return win;
}

test("the boot script sets the global and the boot values, and injects nothing", () => {
  const src = bootScript({
    global: GLOBAL,
    boot: [["a", "data-theme", "dark"]],
    session: '{"token":"t","userId":"sam","name":"Sam Okafor"}',
  });
  const win = runInFakeWindow(src);
  expect([
    win.manentDesktop,
    win.sessionStorage.getItem("manent.boot"),
    win.sessionStorage.getItem("manent.demo.session"),
  ]).toEqual([
    GLOBAL,
    '[["a","data-theme","dark"]]',
    '{"token":"t","userId":"sam","name":"Sam Okafor"}',
  ]);
  expect(Object.isFrozen(win.manentDesktop)).toBe(true);
  const hostile = bootScript({
    global: { ...GLOBAL, dataDir: "/a&b>  " },
    boot: [["a", "x", "</script><script>alert(1)"]],
    session: null,
  });
  expect(hostile.includes("<")).toBe(false);
  expect([">", "&", " ", " "].filter((c) => hostile.includes(c))).toEqual([]);
  const ran = runInFakeWindow(hostile);
  expect([
    ran.sessionStorage.getItem("manent.boot"),
    ran.sessionStorage.getItem("manent.demo.session"),
    ran.manentDesktop,
  ]).toEqual([
    '[["a","x","</script><script>alert(1)"]]',
    null,
    { ...GLOBAL, dataDir: "/a&b>  " },
  ]);
});

test("a storage that throws leaves the global in place", () => {
  const refusing = {
    getItem: () => null,
    setItem: () => {
      throw new Error("the storage is full");
    },
  };
  const win = runInFakeWindow(
    bootScript({ global: GLOBAL, boot: [], session: '{"token":null}' }),
    refusing,
  );
  expect(win.manentDesktop).toEqual(GLOBAL);
});
