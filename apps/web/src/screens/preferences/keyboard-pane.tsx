// Preferences → Keyboard: every command with its keys, grouped by menu, the keys that are fixed and why, and the shortcut editor.
import { COMMANDS, ELEMENT_COMMAND_SLOTS, isChord } from "@manent/commands";
import type { CommandDefinition, Keys } from "@manent/commands";
import { MENU_IDS, latestEntries } from "@manent/settings";
import type { KeyValueMap, MenuId } from "@manent/settings";
import {
  Button,
  Kbd,
  MENU_WORDS,
  PREFERENCES_WORDS,
  Row,
  formatDate,
  keyLabel,
  useCommands,
  useSubscribable,
} from "@manent/ui";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { Where } from "../../platform.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { FixedKey } from "../../services/ports.ts";
import {
  FindByKeys,
  ShortcutCapture,
  labelOf,
  reservedHere,
} from "./shortcut-capture.tsx";

/** A command's own keys to keep, or null to give it back its defaults. */
export interface ShortcutChange {
  commandId: string;
  keys: Keys | null;
}

/** A shortcut the person set: its keys, when (milliseconds since the epoch) and the name of the device it was set on. */
interface CustomShortcut {
  keys: Keys;
  at: number;
  on: string;
}

/** One command's row: its keys now, its defaults on this platform, what the person set, and what the row must say. */
interface ShortcutView {
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

// the title and person menus are named by the document's title and the person's initials: their commands have no heading
const MENU_LABELS: Readonly<Record<MenuId, string | null>> = Object.freeze({
  app: MENU_WORDS.app,
  file: MENU_WORDS.file,
  edit: MENU_WORDS.edit,
  view: MENU_WORDS.view,
  format: MENU_WORDS.format,
  script: MENU_WORDS.script,
  production: MENU_WORDS.production,
  window: MENU_WORDS.window,
  help: MENU_WORDS.help,
  title: null,
  person: null,
});
const FIXED_WORDS: Readonly<Record<FixedKey["reason"], string>> = Object.freeze(
  { flow: PREFERENCES_WORDS.fixedFlow, picker: PREFERENCES_WORDS.fixedPicker },
);
// the element picker opens on this chord; an element command then takes its slot's key
const PICKER_CHORD = "Alt+Enter";

const isKeys = (value: unknown): value is Keys =>
  Array.isArray(value) &&
  value.every((chord) => typeof chord === "string" && isChord(chord));

/** The commands a person can give keys to: a message's own reverse has none. */
const LISTED: readonly CommandDefinition[] = Object.freeze(
  COMMANDS.filter((def) => "keywords" in def.palette),
);

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

/** A row of every listed command, in the order of `COMMANDS`. */
export function useShortcutViews(): readonly ShortcutView[] {
  const { service, resolved } = useCommands();
  const { effective } = useSubscribable(resolved);
  const custom = useCustomShortcuts(useServices().keys);
  const { where } = useEnvironment();
  const paletteKeys = effective.get("app.palette") ?? [];
  return LISTED.map((def): ShortcutView => {
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

function KeysText(props: { keys: Keys }): ReactNode {
  const { platform } = useCommands();
  if (props.keys.length === 0) return PREFERENCES_WORDS.noShortcut;
  return (
    <span className="inline-flex gap-1">
      {props.keys.map((chord) => (
        <Kbd key={chord}>{keyLabel(chord, platform)}</Kbd>
      ))}
    </span>
  );
}

/** "Set by you 12 Nov · Default: ⌘⇧A", naming the device it was set on when that is not this one. */
function setByYouLine(
  custom: CustomShortcut,
  defaults: Keys,
  where: Where,
  deviceName: string | null,
): string {
  const defaultLabel =
    defaults.length === 0
      ? PREFERENCES_WORDS.noShortcut
      : defaults.map((chord) => keyLabel(chord, where.platform)).join(" · ");
  const from = custom.on === "" || custom.on === deviceName ? null : custom.on;
  return PREFERENCES_WORDS.setByYou(formatDate(custom.at), defaultLabel, from);
}

/**
 * One command's row. With `onCapture` the row opens the shortcut editor when activated, and `onShortcuts` keeps what
 * it records; without it the row only shows the keys and resets them. `posinset` counts from 1 within `setsize` rows.
 */
export function ShortcutRow(props: {
  view: ShortcutView;
  posinset: number;
  setsize: number;
  deviceName: string | null;
  capturing: boolean;
  onCapture: ((open: boolean) => void) | null;
  onShortcuts(changes: readonly ShortcutChange[]): void;
}): ReactNode {
  const {
    view,
    posinset,
    setsize,
    deviceName,
    capturing,
    onCapture,
    onShortcuts,
  } = props;
  const { where } = useEnvironment();
  const row = useRef<HTMLElement>(null);
  const editable = view.fixed === null && onCapture !== null;
  const close = (): void => {
    onCapture?.(false);
    row.current?.focus();
  };
  return (
    <li
      aria-posinset={posinset}
      aria-setsize={setsize}
      className="flex flex-col"
    >
      <Row
        rowRef={row}
        meta={view.fixed ?? undefined}
        trailing={[<KeysText key="keys" keys={view.keys} />]}
        onActivate={editable ? () => onCapture(true) : undefined}
      >
        {view.label}
      </Row>
      {view.custom === null && view.notes.length === 0 ? null : (
        <div className="flex flex-col gap-1 px-3 pb-2 text-meta text-fg-muted">
          {view.custom === null ? null : (
            <p className="flex flex-wrap items-center gap-2">
              {setByYouLine(view.custom, view.defaults, where, deviceName)}
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={() =>
                  onShortcuts([{ commandId: view.id, keys: null }])
                }
              >
                {PREFERENCES_WORDS.reset}
              </Button>
            </p>
          )}
          {view.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}
      {capturing ? (
        <ShortcutCapture
          commandId={view.id}
          label={view.label}
          onKeys={(keys) => {
            onShortcuts([{ commandId: view.id, keys }]);
            close();
          }}
          onClose={close}
        />
      ) : null}
    </li>
  );
}

/** A table card of rows under `heading`, or with no head row when the rows have no heading. */
export function ShortcutTable(props: {
  heading: string | null;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="mn-table flex flex-col">
      {props.heading === null ? null : (
        <h3 className="mn-table-head flex items-center px-3">
          {props.heading}
        </h3>
      )}
      <ul className="flex flex-col">{props.children}</ul>
    </section>
  );
}

function FixedRow(props: {
  fixed: FixedKey;
  posinset: number;
  setsize: number;
}): ReactNode {
  const { where } = useEnvironment();
  return (
    <li aria-posinset={props.posinset} aria-setsize={props.setsize}>
      <Row meta={FIXED_WORDS[props.fixed.reason]}>
        {keyLabel(props.fixed.chord, where.platform)}
      </Row>
    </li>
  );
}

/** Rows set by you and rows that may not work here first, each kind in its own order. */
const byAttention = (views: readonly ShortcutView[]): ShortcutView[] => [
  ...views.filter((v) => v.custom !== null || v.mayNotWork),
  ...views.filter((v) => v.custom === null && !v.mayNotWork),
];

/** `onShortcuts` keeps each change the shortcut editor or a Reset makes. */
export function KeyboardPane(props: {
  deviceName: string | null;
  onShortcuts(changes: readonly ShortcutChange[]): void;
}): ReactNode {
  const { deviceName, onShortcuts } = props;
  const views = useShortcutViews();
  const fixedKeys = useSubscribable(useServices().fixedKeys);
  const [capturing, setCapturing] = useState<string | null>(null);
  const groups = MENU_IDS.map((menu) => ({
    menu,
    label: MENU_LABELS[menu],
    views: byAttention(views.filter((view) => view.group === menu)),
  })).filter((group) => group.views.length > 0);
  return (
    <>
      <FindByKeys />
      <div
        role="group"
        aria-label={PREFERENCES_WORDS.shortcutsGroup}
        className="flex flex-col gap-4"
      >
        {groups.map((group) => (
          <ShortcutTable key={group.menu} heading={group.label}>
            {group.views.map((view, index) => (
              <ShortcutRow
                key={view.id}
                view={view}
                posinset={index + 1}
                setsize={group.views.length}
                deviceName={deviceName}
                capturing={capturing === view.id}
                onCapture={(open) => setCapturing(open ? view.id : null)}
                onShortcuts={onShortcuts}
              />
            ))}
          </ShortcutTable>
        ))}
        {fixedKeys.length === 0 ? null : (
          <ShortcutTable heading={PREFERENCES_WORDS.writing}>
            {fixedKeys.map((fixed, index) => (
              <FixedRow
                key={fixed.chord}
                fixed={fixed}
                posinset={index + 1}
                setsize={fixedKeys.length}
              />
            ))}
          </ShortcutTable>
        )}
      </div>
    </>
  );
}
