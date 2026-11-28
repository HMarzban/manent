// Platform-specific native window chrome settings for the Electrobun shell.

export interface WindowChromeConfig {
  readonly titleBarStyle: "hiddenInset" | "default";
  readonly trafficLightOffset?: { readonly x: number; readonly y: number };
}

/**
 * Inset traffic-light offset that centres macOS's 12 px window controls vertically inside
 * the 36 px custom desktop title bar with balanced left breathing room.
 */
export const MAC_TRAFFIC_LIGHT_OFFSET: Readonly<{ x: number; y: number }> =
  Object.freeze({ x: 6, y: 2 });

/**
 * Main window chrome by platform:
 * - macOS: `hiddenInset` with centred native traffic lights on the left.
 * - Windows: `hiddenInset` (native resize handles and snap, no OS titlebar) paired with
 *   right-aligned custom Windows caption buttons in the web title bar.
 * - Linux: `default` OS frame (Electrobun CEF keeps window-manager decorations on Linux).
 */
export function mainWindowChrome(
  platform: NodeJS.Platform,
): WindowChromeConfig {
  if (platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      trafficLightOffset: { ...MAC_TRAFFIC_LIGHT_OFFSET },
    };
  }
  if (platform === "win32") return { titleBarStyle: "hiddenInset" };
  return { titleBarStyle: "default" };
}

/**
 * Secondary Present window (Room / Prompter) chrome: macOS and Windows share the same custom
 * `hiddenInset` titlebar routed by `windowKey`; Linux keeps native window-manager chrome.
 */
export function presentWindowChrome(
  platform: NodeJS.Platform,
): WindowChromeConfig {
  if (platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      trafficLightOffset: { ...MAC_TRAFFIC_LIGHT_OFFSET },
    };
  }
  if (platform === "win32") return { titleBarStyle: "hiddenInset" };
  return { titleBarStyle: "default" };
}
