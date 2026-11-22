// Keys a system or a browser keeps for itself: what their documentation says, and what the key probe measured.
import type { Platform } from "@manent/settings";
import type { Chord } from "./chord.ts";
import { KEY_PROBE_RESULTS } from "./key-probe.ts";

/** `effect` is the clause shown after the key in a warning ("usually opens a new tab"); `leavesScript` when pressing it takes the person away from the script. */
export interface ReservedKey {
  chord: Chord;
  platform: Platform;
  host: "os" | "chromium" | "firefox" | "safari" | "desktop";
  effect: string;
  leavesScript: boolean;
  evidence: "documented" | "assumed" | "measured";
}

const PLATFORMS: readonly Platform[] = ["mac", "windows", "linux"];
const BROWSERS = ["chromium", "firefox", "safari"] as const;

const BROWSER_KEYS: readonly Pick<
  ReservedKey,
  "chord" | "effect" | "leavesScript"
>[] = [
  { chord: "Mod+T", effect: "usually opens a new tab", leavesScript: false },
  { chord: "Mod+N", effect: "usually opens a new window", leavesScript: false },
  { chord: "Mod+W", effect: "usually closes this tab", leavesScript: true },
];

export const RESERVED_KEYS: readonly ReservedKey[] = Object.freeze([
  ...BROWSER_KEYS.flatMap((key) =>
    PLATFORMS.flatMap((platform) =>
      BROWSERS.map((host): ReservedKey =>
        Object.freeze({ ...key, platform, host, evidence: "documented" }),
      ),
    ),
  ),
  ...(
    [
      ["Alt+Tab", "windows"],
      ["Alt+Tab", "linux"],
      ["Mod+Tab", "mac"],
    ] as const
  ).map(([chord, platform]): ReservedKey =>
    Object.freeze({
      chord,
      platform,
      host: "os",
      effect: "switches windows",
      leavesScript: false,
      evidence: "documented",
    }),
  ),
  ...KEY_PROBE_RESULTS.filter((probed) => !probed.arrived).map(
    ({ chord, platform, host }): ReservedKey =>
      Object.freeze({
        chord,
        platform,
        host,
        effect: "never reached Manent",
        leavesScript: false,
        evidence: "measured",
      }),
  ),
]);
