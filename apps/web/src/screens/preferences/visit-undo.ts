// One visit to Preferences: each change made on the screen, the undo list that puts it back, and the resets offered back.
import { SETTINGS, UNSET, entryKey } from "@manent/settings";
import type {
  KeyValueMap,
  ResetReceipt,
  SettingKey,
  SettingsStore,
} from "@manent/settings";
import { createValue, messageFor } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { PersonServices } from "../../services/ports.ts";
import { readCustomShortcuts } from "./keyboard-pane.tsx";
import type { ShortcutChange } from "./keyboard-pane.tsx";

/** What changed (a preference, or the shortcuts) and what it was; the list lasts for this visit only. */
export interface VisitUndo {
  record(key: SettingKey | "shortcuts", was: unknown): void;
  /** Puts back the last change recorded; false when there is none. */
  undo(): boolean;
  /** How many changes are waiting to be undone during this visit. */
  readonly count: Subscribable<number>;
}

/** `putBack` receives each record as it was given to `record`, the latest first. */
function createVisitUndo(options: {
  putBack(key: SettingKey | "shortcuts", was: unknown): void;
}): VisitUndo {
  const records: { key: SettingKey | "shortcuts"; was: unknown }[] = [];
  const count = createValue(0);
  return {
    count,
    record(key, was) {
      records.push({ key, was });
      count.set(records.length);
    },
    undo() {
      const last = records.pop();
      if (last === undefined) return false;
      count.set(records.length);
      options.putBack(last.key, last.was);
      return true;
    },
  };
}

const isSettingKey = (key: string): key is SettingKey =>
  SETTINGS.all.some((def) => def.key === key);

const isReceipt = (value: unknown): value is ResetReceipt =>
  typeof value === "object" &&
  value !== null &&
  "entries" in value &&
  Array.isArray(value.entries) &&
  value.entries.every(
    (entry: unknown) =>
      typeof entry === "object" &&
      entry !== null &&
      "key" in entry &&
      typeof entry.key === "string",
  );

const isShortcutChanges = (value: unknown): value is ShortcutChange[] =>
  Array.isArray(value) &&
  value.every(
    (change: unknown) =>
      typeof change === "object" &&
      change !== null &&
      "commandId" in change &&
      typeof change.commandId === "string" &&
      "keys" in change,
  );

/** Writes what a control or an undo gives, once the setting's own type accepts it. */
function setFrom(store: SettingsStore, key: SettingKey, input: unknown): void {
  const parsed = SETTINGS.get(key).type.parse(input);
  if (parsed.ok) store.set(key, parsed.value);
}

/** The value `key` holds of its own, or UNSET while it has none. */
function ownValue(store: SettingsStore, key: SettingKey): unknown {
  const explained = store.explain(key);
  return explained.source === "own" ? explained.value : UNSET;
}

function putBackSettings(settings: SettingsStore, receipt: ResetReceipt): void {
  for (const { key, was } of receipt.entries) {
    if (!isSettingKey(key)) continue;
    if (was === UNSET) settings.reset(key);
    else setFrom(settings, key, was);
  }
}

/** `settings`, recording in `undo` each change and row reset made through it. */
function recordingStore(
  settings: SettingsStore,
  undo: VisitUndo,
): SettingsStore {
  return {
    get: (key) => settings.get(key),
    explain: (key) => settings.explain(key),
    set(key, value) {
      const was = ownValue(settings, key);
      const result = settings.set(key, value);
      if (result.ok) undo.record(key, { entries: [{ key, was }] });
      return result;
    },
    hold: (key) => settings.hold(key),
    reset(target) {
      const receipt = settings.reset(target);
      // a scope's reset is recorded by resetPreferences, as one change with the other scope it resets
      if (typeof target === "string" && receipt.entries.length > 0)
        undo.record(target, receipt);
      return receipt;
    },
    restore: (receipt) => settings.restore(receipt),
    subscribe: (key, listener) => settings.subscribe(key, listener),
    modified: (scope) => settings.modified(scope),
  };
}

/** The person's own shortcuts on this device: writing changes, and reading what changes would replace. */
interface ShortcutWriter {
  write(changes: readonly ShortcutChange[]): void;
  /** The keys each changed command holds of its own before `changes`, null for its defaults. */
  before(changes: readonly ShortcutChange[]): ShortcutChange[];
}

function createShortcutWriter(options: {
  keys: KeyValueMap;
  deviceId: string;
  deviceName: string;
  now: () => number;
}): ShortcutWriter {
  const { keys, deviceId, deviceName, now } = options;
  return {
    write(changes) {
      for (const { commandId, keys: kept } of changes)
        keys.set(entryKey(commandId, deviceId), {
          v: kept,
          at: now(),
          on: deviceName,
          unset: kept === null,
        });
    },
    before(changes) {
      const custom = readCustomShortcuts(keys);
      return changes.map(({ commandId }) => ({
        commandId,
        keys: custom.get(commandId)?.keys ?? null,
      }));
    },
  };
}

/** The changes of one visit: each is recorded, and a reset is also offered back in the message slot. */
export interface Visit {
  undo: VisitUndo;
  /** The person's store, recording each change and row reset made through it. */
  store: SettingsStore;
  setShortcuts(changes: readonly ShortcutChange[]): void;
  resetPreferences(): void;
  resetShortcuts(): void;
}

export function createVisit(options: {
  services: PersonServices;
  deviceId: string;
  deviceName: string;
  now: () => number;
}): Visit {
  const { services, deviceId, deviceName, now } = options;
  const { settings, keys, messages, reverses } = services;
  const shortcuts = createShortcutWriter({ keys, deviceId, deviceName, now });
  const undo = createVisitUndo({
    putBack(key, was) {
      if (key === "shortcuts") {
        if (isShortcutChanges(was)) shortcuts.write(was);
      } else if (isReceipt(was)) putBackSettings(settings, was);
    },
  });
  const offerBack = (count: number, reverse: () => void): void => {
    const message = messageFor({ kind: "preferences_reset", count });
    reverses.set(message.id, reverse);
    messages.push(message);
  };
  return {
    undo,
    store: recordingStore(settings, undo),
    setShortcuts(changes) {
      undo.record("shortcuts", shortcuts.before(changes));
      shortcuts.write(changes);
    },
    resetPreferences() {
      const receipt: ResetReceipt = {
        entries: [
          ...settings.reset({ scope: "personal" }).entries,
          ...settings.reset({ scope: "device" }).entries,
        ],
      };
      const first = receipt.entries.map((e) => e.key).find(isSettingKey);
      if (first === undefined) return;
      undo.record(first, receipt);
      offerBack(receipt.entries.length, () => settings.restore(receipt));
    },
    resetShortcuts() {
      const changes = [...readCustomShortcuts(keys).keys()].map(
        (commandId): ShortcutChange => ({ commandId, keys: null }),
      );
      if (changes.length === 0) return;
      const was = shortcuts.before(changes);
      undo.record("shortcuts", was);
      shortcuts.write(changes);
      // the shortcuts are one preference, however many of them were set
      offerBack(1, () => shortcuts.write(was));
    },
  };
}
