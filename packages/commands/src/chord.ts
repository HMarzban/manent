// A chord is the hotkey library's string form: modifiers in the order Mod, Control, Alt, Shift, then one key.
import type { Platform } from "@manent/settings";

export type Chord = string;
/** Alternatives for one command; empty means no shortcut. */
export type Keys = readonly Chord[];
export type PlatformKeys = Readonly<Record<Platform, Keys>>;

// keys that type a letter, a digit or a symbol on some layout
const CHARACTER_KEY = "[A-Z0-9]|[,/\\[\\]=-]";
const KEY = `${CHARACTER_KEY}|F(?:1[0-2]|[1-9])|Enter|Escape|Arrow(?:Up|Down|Left|Right)|PageUp|PageDown|Home|End`;
const CHORD_PATTERN = new RegExp(
  `^(?:Mod\\+)?(?:Control\\+)?(?:Alt\\+)?(?:Shift\\+)?(?:${KEY})$`,
);
const CHARACTER_PATTERN = new RegExp(`^(?:${CHARACTER_KEY})$`);

export function isChord(value: string): boolean {
  return CHORD_PATTERN.test(value);
}

/** The modifiers of a chord, and its key. */
export function splitChord(chord: Chord): {
  modifiers: ReadonlySet<string>;
  key: string;
} {
  const at = chord.lastIndexOf("+");
  return {
    modifiers: new Set(at < 0 ? [] : chord.slice(0, at).split("+")),
    key: chord.slice(at + 1),
  };
}

const MODIFIERS = ["Mod", "Control", "Alt", "Shift"] as const;

/**
 * The one spelling of the press a chord of `isChord`'s grammar makes on `platform`: off macOS Mod is Control, so `Mod+X`,
 * `Control+X` and `Mod+Control+X` are all `Control+X` there. Compare chords in this form; show them as written.
 */
export function canonicalChord(chord: Chord, platform: Platform): Chord {
  const { modifiers, key } = splitChord(chord);
  const held = new Set(modifiers);
  if (platform !== "mac" && held.delete("Mod")) held.add("Control");
  return [...MODIFIERS.filter((modifier) => held.has(modifier)), key].join("+");
}

/**
 * The layout rule a chord breaks, or null. On Windows and Linux AltGr arrives as Control and Alt, so Control with Alt and a
 * character key may type a character (`ctrl_alt_character`); Alt or Option without Mod or Control does on every platform (`alt_character`).
 */
export function breaksLayoutRules(
  chord: Chord,
  platform: Platform,
): "ctrl_alt_character" | "alt_character" | null {
  const { modifiers, key } = splitChord(chord);
  if (!modifiers.has("Alt") || !CHARACTER_PATTERN.test(key)) return null;
  const control =
    modifiers.has("Control") || (platform !== "mac" && modifiers.has("Mod"));
  if (control && platform !== "mac") return "ctrl_alt_character";
  if (!control && !modifiers.has("Mod")) return "alt_character";
  return null;
}
