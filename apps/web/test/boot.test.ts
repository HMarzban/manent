import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { BOOT_KEY, writeBootCache } from "../src/boot/boot-cache.ts";
import { BOOT_SCRIPT, bootScriptHash } from "../src/boot/boot-script.ts";
import type { TabStorage } from "../src/session.ts";

withDom();

const fakeStorage = (): TabStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
};

const refusing: TabStorage = {
  getItem: () => {
    throw new DOMException("refused", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("full", "QuotaExceededError");
  },
  removeItem: () => {
    throw new DOMException("refused", "SecurityError");
  },
};

/** Runs the inline script as the page runs it, with `storage` as the tab's storage. */
const runBootScript = (storage: () => TabStorage): void => {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get: storage,
  });
  new Function(BOOT_SCRIPT)();
};

afterEach(() => {
  for (const name of document.documentElement.getAttributeNames())
    if (name.startsWith("data-"))
      document.documentElement.removeAttribute(name);
});

test("the boot cache is one key in tab storage holding resolved writes", () => {
  const s = fakeStorage();
  writeBootCache(s, [["a", "data-theme", "dark"]]);
  expect([BOOT_KEY, s.getItem("manent.boot")]).toEqual([
    "manent.boot",
    '[["a","data-theme","dark"]]',
  ]);
});

test("a boot cache that cannot be written is left alone", () => {
  expect([
    writeBootCache(refusing, [["a", "data-theme", "dark"]]),
    writeBootCache(null, [["a", "data-theme", "dark"]]),
  ]).toEqual([undefined, undefined]);
});

test("the boot script replays the cached writes on the root", () => {
  const s = fakeStorage();
  document.documentElement.setAttribute("data-cursors", "off");
  writeBootCache(s, [
    ["a", "data-theme", "dark"],
    ["a", "data-white-page", ""],
    ["a", "data-cursors", null],
  ]);
  runBootScript(() => s);
  expect([
    document.documentElement.getAttribute("data-theme"),
    document.documentElement.getAttribute("data-white-page"),
    document.documentElement.hasAttribute("data-cursors"),
  ]).toEqual(["dark", "", false]);
});

test("a boot cache that cannot be read changes nothing", () => {
  runBootScript(() => {
    throw new DOMException("refused", "SecurityError");
  });
  const s = fakeStorage();
  s.setItem(BOOT_KEY, "not json");
  runBootScript(() => s);
  expect(document.documentElement.getAttributeNames()).toEqual([]);
});

test("the boot script is small and constant", () => {
  expect(BOOT_SCRIPT.length).toBeLessThan(500);
  expect(BOOT_SCRIPT).not.toContain("appearance");
});

test("the boot script's hash is the sha256 a content security policy names", () => {
  expect(bootScriptHash()).toBe(
    "sha256-mchJPjVsOfb/RnGUpnCiSW9GOt4DN0uNX9qV5v3jpyo=",
  );
});
