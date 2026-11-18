// Whether a chord a person just pressed may become a command's shortcut, checked in a fixed order.
import type { Platform } from "@manent/settings";
import { scopesOverlap } from "./bindings.ts";
import type { Resolved } from "./bindings.ts";
import { breaksLayoutRules, splitChord } from "./chord.ts";
import type { Chord } from "./chord.ts";
import type { CommandDefinition } from "./define.ts";
import { RESERVED_KEYS } from "./reserved-keys.ts";
import type { ReservedKey } from "./reserved-keys.ts";

export type CaptureVerdict =
  | { ok: true }
  | { ok: false; reason: "fixed" | "types_character" | "leaves_script" }
  | { ok: "ask"; holderId: string }
  | { ok: "warn"; effect: string };

// the page's structural keys and the editing keys every system shares
const FIXED_CHORDS: ReadonlySet<Chord> = new Set([
  "Enter",
  "Tab",
  "Shift+Tab",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Mod+Z",
  "Mod+Shift+Z",
  "Control+Y",
  "Mod+X",
  "Mod+C",
  "Mod+V",
  "Mod+A",
]);

const CONTROL_CHARACTER = /^\p{Cc}*$/u;

function isReservedHere(
  key: ReservedKey,
  platform: Platform,
  shell: "web" | "desktop",
): boolean {
  if (key.platform !== platform) return false;
  if (key.host === "os") return true;
  return shell === "desktop" ? key.host === "desktop" : key.host !== "desktop";
}

/**
 * The verdict on giving `chord` to `commandId`: fixed, then a typed character, then leaving the script on the web, then another
 * command holding it in an overlapping scope (`ask`), then a key this platform reserves (`warn`). `typedCharacter` is what the
 * press typed, or null. Throws RangeError for a command id `commands` does not hold.
 */
export function checkCapture(options: {
  chord: Chord;
  typedCharacter: string | null;
  commandId: string;
  commands: readonly CommandDefinition[];
  resolved: Resolved;
  platform: Platform;
  shell: "web" | "desktop";
}): CaptureVerdict {
  const {
    chord,
    typedCharacter,
    commandId,
    commands,
    resolved,
    platform,
    shell,
  } = options;
  const target = commands.find((def) => def.id === commandId);
  if (target === undefined)
    throw new RangeError(`no command is registered as ${commandId}`);
  const holder = commands.find(
    (def) =>
      def.id !== commandId &&
      scopesOverlap(def.scope, target.scope) &&
      (resolved.effective.get(def.id) ?? []).includes(chord),
  );
  if (FIXED_CHORDS.has(chord) || holder?.keysFixed === true)
    return { ok: false, reason: "fixed" };

  const { modifiers } = splitChord(chord);
  const typesCharacter =
    typedCharacter !== null &&
    !CONTROL_CHARACTER.test(typedCharacter) &&
    !modifiers.has("Mod") &&
    !modifiers.has("Control");
  if (typesCharacter || breaksLayoutRules(chord, platform) !== null)
    return { ok: false, reason: "types_character" };

  const reserved = RESERVED_KEYS.filter(
    (key) => key.chord === chord && isReservedHere(key, platform, shell),
  );
  if (shell === "web" && reserved.some((key) => key.leavesScript))
    return { ok: false, reason: "leaves_script" };
  if (holder !== undefined) return { ok: "ask", holderId: holder.id };
  const [first] = reserved;
  if (first !== undefined) return { ok: "warn", effect: first.effect };
  return { ok: true };
}
