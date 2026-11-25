// Shortcut view model for Preferences → Keyboard: custom bindings, reserved-key notes, and shell filtering.
import { COMMANDS, ELEMENT_COMMAND_SLOTS, isChord } from "@manent/commands";
import type { CommandDefinition, Keys } from "@manent/commands";
import { latestEntries } from "@manent/settings";
import type { KeyValueMap, MenuId } from "@manent/settings";
import {
  PREFERENCES_WORDS,
  keyLabel,
  useCommands,
  useSubscribable,
} from "@manent/ui";
import { useCallback, useRef, useSyncExternalStore } from "react";
import type { Where } from "../../platform.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { labelOf, reservedHere } from "./shortcut-capture.tsx";

/** A command's own keys to keep, or null to give it back its defaults. */
export interface ShortcutChange {
  commandId: string;
  keys: Keys | null;
}

/** A shortcut the person set: its keys, when (milliseconds since the epoch) and the name of the device it was set on. */
export interface CustomShortcut {
  keys: Keys;
  at: number;
  on: string;
}

/** One command's row: its keys now, its defaults on this platform, what the person set, and what the row must say. */
export interface ShortcutView {
  id: string;
  group: MenuId;
  label: string;
  keys: Keys;
  defaults: Keys;
  custom: CustomShortcut | null;
  /** The sentence of a row whose keys no one can change; null for every other row. */
  fixed: string | null;
  notes: readonly string[];
  /** A key of the row may not reach Manent in this browser. */
  mayNotWork: boolean;
}

// the element picker opens on this chord; an element command then takes its slot's key
const PICKER_CHORD = "Alt+Enter";

const isKeys = (value: unknown): value is Keys =>
  Array.isArray(value) &&
  value.every((chord) => typeof chord === "string" && isChord(chord));

const LISTED: readonly CommandDefinition[] = Object.freeze(
  COMMANDS.filter((def) => "keywords" in def.palette),
);
const DESKTOP_ONLY_IDS: ReadonlySet<string> = new Set([
  "app.openInBrowser",
  "file.open",
  "prompter.files",
  "prompter.stopFiles",
]);

/** The person's own shortcuts by command id, from the latest entry of each; a cleared entry gives the default back. */
export function readCustomShortcuts(
  map: KeyValueMap,
): ReadonlyMap<string, CustomShortcut> {
  const entries = latestEntries(
    Object.fromEntries(map.keys().map((key) => [key, map.get(key)])),
  );
  return new Map(
    [...entries].flatMap(([commandId, entry]) =>
      !entry.unset && isKeys(entry.v)
        ? [[commandId, { keys: entry.v, at: entry.at, on: entry.on }]]
        : [],
    ),
  );
}

/** The person's own shortcuts, read again whenever the map changes. */
export function useCustomShortcuts(
  map: KeyValueMap,
): ReadonlyMap<string, CustomShortcut> {
  const cache = useRef<{
    raw: string;
    value: ReadonlyMap<string, CustomShortcut>;
  } | null>(null);
  const subscribe = useCallback(
    (listener: () => void) => map.subscribe(listener),
    [map],
  );
  const read = useCallback(() => {
    const raw = JSON.stringify(map.keys().map((key) => [key, map.get(key)]));
    if (cache.current?.raw !== raw)
      cache.current = { raw, value: readCustomShortcuts(map) };
    return cache.current.value;
  }, [map]);
  return useSyncExternalStore(subscribe, read);
}

const hasVoiceOverChord = (keys: Keys, where: Where): boolean =>
  where.platform === "mac" &&
  keys.some((chord) => {
    const parts = chord.split("+");
    return parts.includes("Control") && parts.includes("Alt");
  });

/** The way to a command that always works: its element's slot after the picker's chord, else the palette's chord and its name. */
function alwaysWorks(
  id: string,
  where: Where,
  paletteKeys: Keys,
): string | null {
  const slot = ELEMENT_COMMAND_SLOTS[id];
  if (slot !== undefined)
    return PREFERENCES_WORDS.alwaysWorksElement(
      keyLabel(PICKER_CHORD, where.platform) + " then " + slot,
    );
  const [palette] = paletteKeys;
  return palette === undefined
    ? null
    : PREFERENCES_WORDS.alwaysWorksCommand(keyLabel(palette, where.platform));
}

/** Every note a row carries: VoiceOver's own chords, and a key this browser usually keeps, with the way that always works. */
function notesFor(
  id: string,
  keys: Keys,
  where: Where,
  paletteKeys: Keys,
): string[] {
  const notes: string[] = [];
  if (hasVoiceOverChord(keys, where))
    notes.push(PREFERENCES_WORDS.voiceOverNote);
  // no record of a key that has run on this device is kept yet, so every such key is said to be at risk
  const [reserved] = keys.flatMap((chord) =>
    reservedHere(chord, where).map((key) => ({ chord, effect: key.effect })),
  );
  if (reserved !== undefined) {
    const may = PREFERENCES_WORDS.mayNotWork(
      keyLabel(reserved.chord, where.platform),
      reserved.effect,
    );
    const way = alwaysWorks(id, where, paletteKeys);
    notes.push(way === null ? may : `${may} ${way}`);
  }
  return notes;
}

/** A row of every listed command for the active shell, in the order of `COMMANDS`. */
export function useShortcutViews(): readonly ShortcutView[] {
  const { service, resolved } = useCommands();
  const { effective } = useSubscribable(resolved);
  const custom = useCustomShortcuts(useServices().keys);
  const { where } = useEnvironment();
  const paletteKeys = effective.get("app.palette") ?? [];
  const listed =
    where.shell === "desktop"
      ? LISTED
      : LISTED.filter((def) => !DESKTOP_ONLY_IDS.has(def.id));
  return listed.map((def): ShortcutView => {
    const keys = effective.get(def.id) ?? [];
    return {
      id: def.id,
      group: def.group,
      label: labelOf(service, def.id),
      keys,
      defaults: def.keys[where.platform],
      custom: custom.get(def.id) ?? null,
      fixed: def.keysFixed ? PREFERENCES_WORDS.fixedClipboard : null,
      notes: notesFor(def.id, keys, where, paletteKeys),
      mayNotWork: keys.some((chord) => reservedHere(chord, where).length > 0),
    };
  });
}
