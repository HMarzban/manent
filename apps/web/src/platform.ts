// The one module that reads the user agent: the platform, the shell, the browser and the system this tab runs on.
import type { Platform } from "@manent/settings";

export interface Where {
  platform: Platform;
  shell: "web" | "desktop";
  browser: "Chrome" | "Firefox" | "Safari" | "Edge" | null;
  system: "macOS" | "Windows" | "Linux" | null;
}

// first match wins: Edge's agent also names Chrome, and Chrome's names Safari
const BROWSERS: readonly [NonNullable<Where["browser"]>, RegExp][] = [
  ["Edge", /\bEdg\//],
  ["Firefox", /\bFirefox\//],
  ["Chrome", /\bChrome\//],
  ["Safari", /\bVersion\/[\d.]+ .*\bSafari\//],
];
const SYSTEMS: readonly [NonNullable<Where["system"]>, RegExp][] = [
  ["macOS", /\bMac OS X\b/],
  ["Windows", /\bWindows\b/],
  ["Linux", /\bLinux\b|\bX11\b/],
];
// a phone or tablet's agent also names a desktop system ("like Mac OS X", "Linux; Android")
const MOBILE = /\b(?:Android|iPhone|iPad|iPod)\b/;
const PLATFORM_OF_SYSTEM: Readonly<
  Record<NonNullable<Where["system"]>, Platform>
> = Object.freeze({ macOS: "mac", Windows: "windows", Linux: "linux" });

const firstMatch = <T>(table: readonly [T, RegExp][], text: string): T | null =>
  table.find(([, pattern]) => pattern.test(text))?.[0] ?? null;

/** Where `nav` runs. The desktop app's own build supplies `shell: "desktop"`; an agent read here is always the web's. */
export function detectWhere(nav: {
  userAgent: string;
  platform: string;
}): Where {
  const system = MOBILE.test(nav.userAgent)
    ? null
    : firstMatch(SYSTEMS, nav.userAgent);
  const fallback: Platform = nav.platform.startsWith("Mac")
    ? "mac"
    : nav.platform.startsWith("Win")
      ? "windows"
      : "linux";
  return {
    platform: system === null ? fallback : PLATFORM_OF_SYSTEM[system],
    shell: "web",
    browser: firstMatch(BROWSERS, nav.userAgent),
    system,
  };
}

/** "Chrome on macOS"; "Manent for macOS" on desktop; null when either part is unknown. */
export function deviceName(where: Where): string | null {
  if (where.system === null) return null;
  if (where.shell === "desktop") return `Manent for ${where.system}`;
  return where.browser === null ? null : `${where.browser} on ${where.system}`;
}

/** Where this tab runs, and the language it asks for, read once from the browser. */
export function readNavigator(): { where: Where; language: string } {
  return { where: detectWhere(navigator), language: navigator.language };
}
