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

/** Runs the inline script as the page runs it, with `storage` as sessionStorage and `fallback` as localStorage. */
const runBootScript = (
  storage: () => TabStorage,
  fallback: () => TabStorage = () => fakeStorage(),
): void => {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get: storage,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get: fallback,
  });
  new Function(BOOT_SCRIPT)();
};

afterEach(() => {
  try {
    localStorage.removeItem(BOOT_KEY);
  } catch {
    // ignore if a test replaced localStorage with a throwing getter
  }
  for (const name of document.documentElement.getAttributeNames())
    if (name.startsWith("data-"))
      document.documentElement.removeAttribute(name);
});

test("the boot cache is one key in tab storage holding resolved writes and mirrors to fallback", () => {
  const s = fakeStorage();
  const local = fakeStorage();
  writeBootCache(s, [["a", "data-theme", "dark"]], local);
  expect([
    BOOT_KEY,
    s.getItem("manent.boot"),
    local.getItem("manent.boot"),
  ]).toEqual([
    "manent.boot",
    '[["a","data-theme","dark"]]',
    '[["a","data-theme","dark"]]',
  ]);
});

test("a boot cache that cannot be written is left alone", () => {
  expect([
    writeBootCache(refusing, [["a", "data-theme", "dark"]], refusing),
    writeBootCache(null, [["a", "data-theme", "dark"]], null),
  ]).toEqual([undefined, undefined]);
});

test("the boot script replays the cached writes on the root, falling back to localStorage on cold launch", () => {
  const s = fakeStorage();
  const local = fakeStorage();
  document.documentElement.setAttribute("data-cursors", "off");
  writeBootCache(
    s,
    [
      ["a", "data-theme", "dark"],
      ["a", "data-white-page", ""],
      ["a", "data-cursors", null],
    ],
    local,
  );
  runBootScript(
    () => s,
    () => fakeStorage(),
  );
  expect([
    document.documentElement.getAttribute("data-theme"),
    document.documentElement.getAttribute("data-white-page"),
    document.documentElement.hasAttribute("data-cursors"),
  ]).toEqual(["dark", "", false]);

  // Cold PWA launch: empty sessionStorage replays the localStorage mirror.
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-white-page");
  runBootScript(
    () => fakeStorage(),
    () => local,
  );
  expect([
    document.documentElement.getAttribute("data-theme"),
    document.documentElement.getAttribute("data-white-page"),
  ]).toEqual(["dark", ""]);

  // Per-tab sessionStorage overrides localStorage when both hold values.
  const tab = fakeStorage();
  writeBootCache(tab, [["a", "data-theme", "light"]], null);
  runBootScript(
    () => tab,
    () => local,
  );
  expect(document.documentElement.getAttribute("data-theme")).toBe("light");
});

test("a boot cache that cannot be read changes nothing", () => {
  runBootScript(
    () => {
      throw new DOMException("refused", "SecurityError");
    },
    () => {
      throw new DOMException("refused", "SecurityError");
    },
  );
  const s = fakeStorage();
  s.setItem(BOOT_KEY, "not json");
  runBootScript(
    () => s,
    () => fakeStorage(),
  );
  expect(document.documentElement.getAttributeNames()).toEqual([]);
});

test("the boot script is small and constant", () => {
  expect(BOOT_SCRIPT.length).toBeLessThan(500);
  expect(BOOT_SCRIPT).not.toContain("appearance");
});

test("the boot script's hash is the sha256 a content security policy names", () => {
  expect(bootScriptHash()).toBe(
    "sha256-ymymEEYJB2rkNq4FdyVHrEqd0sN0B4teb1Vz8Y/ffco=",
  );
});
