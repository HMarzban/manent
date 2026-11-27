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
const IOS_UA = /\b(?:iPhone|iPad|iPod)\b/;
const SAFARI_UA = /\bSafari\//;
const NON_SAFARI_UA =
  /\b(?:Chrome|Chromium|Edg|Firefox|CriOS|FxiOS|EdgiOS|OPiOS)\//;
const PLATFORM_OF_SYSTEM: Readonly<
  Record<NonNullable<Where["system"]>, Platform>
> = Object.freeze({ macOS: "mac", Windows: "windows", Linux: "linux" });

export type InstallHint = "macos_safari" | "ios_safari" | "none";

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

/** True when running in an installed standalone or window-controls-overlay shell. */
export function isStandalone(env?: {
  readonly navigator?: { readonly standalone?: boolean };
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
}): boolean {
  const nav =
    env?.navigator ??
    (typeof navigator !== "undefined"
      ? (navigator as Navigator & { readonly standalone?: boolean })
      : undefined);
  if (nav?.standalone === true) return true;
  const match =
    env?.matchMedia ??
    (typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia.bind(window)
      : undefined);
  if (match === undefined) return false;
  return (
    match("(display-mode: standalone)").matches ||
    match("(display-mode: window-controls-overlay)").matches
  );
}

/** Which manual Safari install instruction applies for `nav`, if any. */
export function detectInstallHint(nav: {
  readonly userAgent: string;
  readonly platform: string;
  readonly maxTouchPoints?: number;
}): InstallHint {
  const { userAgent, platform } = nav;
  if (!SAFARI_UA.test(userAgent) || NON_SAFARI_UA.test(userAgent))
    return "none";
  const isIpadDesktopMode =
    platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
  if (IOS_UA.test(userAgent) || isIpadDesktopMode) return "ios_safari";
  const where = detectWhere(nav);
  if (where.browser === "Safari" && where.system === "macOS")
    return "macos_safari";
  return "none";
}

/** Which manual Safari install instruction applies in this browser, if any. */
export function installHint(nav?: {
  readonly userAgent: string;
  readonly platform: string;
  readonly maxTouchPoints?: number;
}): InstallHint {
  const target =
    nav ?? (typeof navigator !== "undefined" ? navigator : undefined);
  return target === undefined ? "none" : detectInstallHint(target);
}

/** Where this tab runs, the language it asks for and its user agent, read once from the browser. */
export function readNavigator(): {
  where: Where;
  language: string;
  userAgent: string;
  standalone: boolean;
  installHint: InstallHint;
} {
  return {
    where: detectWhere(navigator),
    language: navigator.language,
    userAgent: navigator.userAgent,
    standalone: isStandalone(),
    installHint: installHint(),
  };
}
