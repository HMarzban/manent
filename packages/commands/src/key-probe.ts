// The key probe: every key a tester is asked to press on a system, and the committed record of which reached the page.
import type { Platform } from "@manent/settings";
import { canonicalChord } from "./chord.ts";
import type { Chord } from "./chord.ts";
import { COMMANDS } from "./definitions/index.ts";
import type { ReservedKey } from "./reserved-keys.ts";

/** One key a tester pressed: on which system, in which browser or in the desktop app, and whether the page heard it. */
export interface ProbedKey {
  chord: Chord;
  platform: Platform;
  host: Exclude<ReservedKey["host"], "os">;
  arrived: boolean;
}

/**
 * The shortcut table's keys that no command carries as a default on that system: the candidates off macOS, and the keys
 * of commands not built yet.
 */
const KEY_CANDIDATES: Readonly<Record<Platform, readonly Chord[]>> =
  Object.freeze({
    mac: [
      "Mod+F",
      "Mod+Alt+M",
      "Mod+Alt+N",
      "Mod+Shift+A",
      "Mod+Alt+ArrowDown",
      "Mod+Alt+ArrowUp",
      "Alt+ArrowUp",
      "Alt+ArrowDown",
      "Mod+Shift+]",
      "Mod+Shift+[",
    ],
    windows: [
      "Mod+F",
      "Control+Shift+1",
      "Control+Shift+2",
      "Control+Shift+M",
      "Mod+Shift+A",
      "Alt+PageDown",
      "Alt+PageUp",
      "Alt+ArrowUp",
      "Alt+ArrowDown",
      "Mod+Shift+]",
      "Mod+Shift+[",
    ],
    linux: [
      "Mod+F",
      "Control+Shift+1",
      "Control+Shift+2",
      "Control+Shift+M",
      "Mod+Shift+A",
      "Alt+PageDown",
      "Alt+PageUp",
      "Alt+ArrowUp",
      "Alt+ArrowDown",
      "Mod+Shift+]",
      "Mod+Shift+[",
    ],
  });

/** Every default of every command on `platform`, then every candidate, each press once, as the commands write it. */
export function probeChords(platform: Platform): Chord[] {
  const chords = [
    ...COMMANDS.flatMap((command) => command.keys[platform]),
    ...KEY_CANDIDATES[platform],
  ];
  const seen = new Set<Chord>();
  return chords.filter((chord) => {
    const press = canonicalChord(chord, platform);
    if (seen.has(press)) return false;
    seen.add(press);
    return true;
  });
}

/** The probe's output as a tester committed it: empty until the probe has been run by hand on a system. */
export const KEY_PROBE_RESULTS: readonly ProbedKey[] = Object.freeze([]);
