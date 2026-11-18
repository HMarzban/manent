import { expect, test } from "bun:test";
import { detectWhere, deviceName } from "../src/platform.ts";
import type { Where } from "../src/platform.ts";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const FIREFOX_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0";
const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const EDGE_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
const CHROME_LINUX =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

const named = (userAgent: string, platform: string) =>
  deviceName(detectWhere({ userAgent, platform }));

test("the device is named in words, or not at all", () => {
  expect(named(CHROME_MAC, "MacIntel")).toBe("Chrome on macOS");
  expect(named(FIREFOX_WINDOWS, "Win32")).toBe("Firefox on Windows");
  expect(named(SAFARI_MAC, "MacIntel")).toBe("Safari on macOS");
  expect(named(EDGE_WINDOWS, "Win32")).toBe("Edge on Windows");
  expect(named(CHROME_LINUX, "Linux x86_64")).toBe("Chrome on Linux");
  expect(named(CHROME_ANDROID, "Linux armv81")).toBeNull();
  expect(named("an unknown agent", "")).toBeNull();
  const desktop: Where = {
    platform: "mac",
    shell: "desktop",
    browser: null,
    system: "macOS",
  };
  expect(deviceName(desktop)).toBe("Manent for macOS");
  expect(deviceName({ ...desktop, system: null })).toBeNull();
});

test("the platform follows the system, and the browser's own platform when the agent names none", () => {
  expect(detectWhere({ userAgent: CHROME_MAC, platform: "MacIntel" })).toEqual({
    platform: "mac",
    shell: "web",
    browser: "Chrome",
    system: "macOS",
  });
  expect(
    detectWhere({ userAgent: FIREFOX_WINDOWS, platform: "Win32" }),
  ).toEqual({
    platform: "windows",
    shell: "web",
    browser: "Firefox",
    system: "Windows",
  });
  expect(
    detectWhere({ userAgent: "an unknown agent", platform: "MacIntel" }),
  ).toEqual({ platform: "mac", shell: "web", browser: null, system: null });
  expect(detectWhere({ userAgent: CHROME_ANDROID, platform: "Linux" })).toEqual(
    { platform: "linux", shell: "web", browser: "Chrome", system: null },
  );
});
