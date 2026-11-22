// Every chord given to one command: custom assignments first, then defaults, with clashes settled the same way on every device.
import type { Platform } from "@manent/settings";
import { canonicalChord } from "./chord.ts";
import type { Chord, Keys } from "./chord.ts";
import type { CommandDefinition, CommandScope } from "./define.ts";

/** A person's own assignment. `keys` empty means "No shortcut"; `at` is when it was made, in milliseconds since the epoch. */
export interface CustomBinding {
  commandId: string;
  keys: Keys;
  at: number;
}

/** Chords this device's checks refused, in any spelling of the press. */
export interface Findings {
  failsHere: ReadonlySet<string>;
}

/** `effective` holds every command, in the order given; `editorTable` the editor-scope chords of it; `lostChord` the commands that lost a chord to another. */
export interface Resolved {
  effective: ReadonlyMap<string, Keys>;
  editorTable: readonly { id: string; chord: Chord }[];
  lostChord: readonly string[];
}

/** The browser's own zoom: never bound on the web. */
export const BROWSER_ZOOM_KEYS: readonly Chord[] = Object.freeze([
  "Mod+=",
  "Mod+-",
  "Mod+0",
]);

// the browser's next and previous tab: never bound on the web either
const BROWSER_TAB_KEYS: readonly Chord[] = Object.freeze([
  "Mod+Shift+]",
  "Mod+Shift+[",
]);

/** Two scopes overlap when one press could reach both: a global scope meets every scope, any other only itself. */
export function scopesOverlap(a: CommandScope, b: CommandScope): boolean {
  return a === "global" || b === "global" || a === b;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// latest first; a tie goes to the larger command id, then to the larger chord list, so no order of arrival decides
const latestFirst = (a: CustomBinding, b: CustomBinding): number =>
  b.at - a.at ||
  compare(b.commandId, a.commandId) ||
  compare(b.keys.join(" "), a.keys.join(" "));

/** Every command's chords on this platform and shell. Writes nothing back to `custom` or `findings`. */
export function resolveBindings(options: {
  commands: readonly CommandDefinition[];
  custom: readonly CustomBinding[];
  platform: Platform;
  shell: "web" | "desktop";
  findings: Findings;
}): Resolved {
  const { commands, custom, platform, shell, findings } = options;
  const byId = new Map(commands.map((def) => [def.id, def]));
  const press = (chord: Chord): Chord => canonicalChord(chord, platform);
  const browser = new Set(
    shell === "web"
      ? [...BROWSER_ZOOM_KEYS, ...BROWSER_TAB_KEYS].map(press)
      : [],
  );
  const refused = new Set([...findings.failsHere].map(press));
  const isBrowserKey = (chord: Chord): boolean => browser.has(press(chord));
  // keyed by the press, so two spellings of one press have one holder
  const holders = new Map<Chord, CommandDefinition[]>();
  const held = new Map<string, Chord[]>(commands.map((def) => [def.id, []]));
  const lost = new Set<string>();

  const claim = (def: CommandDefinition, chord: Chord): void => {
    const at = press(chord);
    const current = holders.get(at) ?? [];
    if (current.includes(def)) return;
    if (current.some((other) => scopesOverlap(other.scope, def.scope))) {
      lost.add(def.id);
      return;
    }
    holders.set(at, [...current, def]);
    held.get(def.id)?.push(chord);
  };

  const decided = new Set<string>();
  for (const entry of custom.toSorted(latestFirst)) {
    const def = byId.get(entry.commandId);
    if (def === undefined || decided.has(def.id)) continue;
    const usable = entry.keys.filter(
      (chord) => !refused.has(press(chord)) && !isBrowserKey(chord),
    );
    // an entry with nothing usable here leaves the command to an older entry or its default
    if (entry.keys.length > 0 && usable.length === 0) continue;
    decided.add(def.id);
    for (const chord of usable) claim(def, chord);
  }
  for (const def of commands.toSorted((a, b) => compare(a.id, b.id))) {
    if (decided.has(def.id)) continue;
    for (const chord of def.keys[platform])
      if (!isBrowserKey(chord)) claim(def, chord);
  }

  return {
    effective: held,
    editorTable: commands
      .filter((def) => def.scope === "editor")
      .flatMap((def) =>
        (held.get(def.id) ?? []).map((chord) => ({ id: def.id, chord })),
      ),
    lostChord: commands.filter((def) => lost.has(def.id)).map((def) => def.id),
  };
}
