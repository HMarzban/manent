// How a chord is written for a person: symbols run together on macOS, names joined by "+" elsewhere.
import type { Chord } from "@manent/commands";
import type { Platform } from "@manent/settings";

const MAC_PARTS: Readonly<Record<string, string>> = {
  Mod: "⌘",
  Control: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  Enter: "↵",
  Backspace: "⌫",
  Escape: "Esc",
  ArrowUp: "↑",
  ArrowDown: "↓",
};
const OTHER_PARTS: Readonly<Record<string, string>> = {
  Mod: "Ctrl",
  Control: "Ctrl",
  Escape: "Esc",
  ArrowUp: "↑",
  ArrowDown: "↓",
};
/** "⌘K", "⌥↵", "⇧F6" on macOS; "Ctrl+K", "Ctrl+Shift+Z" on Windows and Linux. */
export function keyLabel(chord: Chord, platform: Platform): string {
  // no chord's key is "+", so every "+" separates two parts
  const parts = chord.split("+");
  if (platform === "mac")
    return parts.map((part) => MAC_PARTS[part] ?? part).join("");
  return parts.map((part) => OTHER_PARTS[part] ?? part).join("+");
}
