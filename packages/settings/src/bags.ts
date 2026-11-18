// The two bags this package supplies: a person's preferences over a shared map, and one held in memory.
import { entryKey, latestEntries, parseEntryKey } from "./personal-entries.ts";
import type { PrefEntry } from "./personal-entries.ts";
import { UNSET } from "./store.ts";
import type { Bag, Provenance } from "./store.ts";

type Listener = Parameters<Bag["subscribe"]>[0];

/** A key–value view of one shared map; `subscribe` hears every change, the map's own writes as "local". */
export interface KeyValueMap {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  keys(): readonly string[];
  subscribe(listener: Listener): () => void;
}

function createListeners(): {
  tell: Listener;
  subscribe: Bag["subscribe"];
} {
  const listeners = new Set<Listener>();
  return {
    tell(keys, origin) {
      for (const listener of listeners) listener(keys, origin);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

interface PersonalView {
  latest: ReadonlyMap<string, PrefEntry & { deviceId: string }>;
  values: Readonly<Record<string, unknown>>;
}

function readView(map: KeyValueMap): PersonalView {
  const latest = latestEntries(
    Object.fromEntries(map.keys().map((key) => [key, map.get(key)])),
  );
  const values = Object.freeze(
    Object.fromEntries(
      [...latest]
        .filter(([, entry]) => !entry.unset)
        .map(([key, entry]) => [key, entry.v]),
    ),
  );
  return { latest, values };
}

/**
 * A person's preferences, laid out as one entry per preference and device. It writes only this device's
 * entries, stamped with `now()` and `deviceName`, and never removes a key, its own or one it does not know.
 */
export function createPersonalBag(options: {
  map: KeyValueMap;
  deviceId: string;
  deviceName: string;
  now: () => number;
}): Bag {
  const { map, deviceId, deviceName, now } = options;
  const listeners = createListeners();
  let view: PersonalView | null = null;
  const current = (): PersonalView => (view ??= readView(map));

  map.subscribe((keys, origin) => {
    view = null;
    const settingKeys = [
      ...new Set(keys.flatMap((key) => parseEntryKey(key)?.settingKey ?? [])),
    ];
    if (settingKeys.length > 0) listeners.tell(settingKeys, origin);
  });

  return Object.freeze({
    read: () => current().values,
    provenance(key: string): Provenance | null {
      const entry = current().latest.get(key);
      if (entry === undefined) return null;
      const on = entry.deviceId === deviceId ? null : entry.on;
      return { at: entry.at, on, byUserId: null, was: null };
    },
    write(patch: Readonly<Record<string, unknown>>): void {
      const at = now();
      for (const [key, value] of Object.entries(patch)) {
        const unset = value === UNSET;
        const entry: PrefEntry = {
          v: unset ? null : value,
          at,
          on: deviceName,
          unset,
        };
        map.set(entryKey(key, deviceId), entry);
      }
      view = null;
    },
    subscribe: listeners.subscribe,
    canWrite: () => true,
  });
}

/** A bag held in memory. `receive` applies a patch as a remote change by `byUserId` and records what it replaced. */
export function createMemoryBag(options: {
  initial: Readonly<Record<string, unknown>>;
  writable: (key: string) => boolean;
}): Bag & {
  receive(
    patch: Readonly<Record<string, unknown>>,
    byUserId: string | null,
  ): void;
} {
  const values = new Map(Object.entries(options.initial));
  const provenances = new Map<string, Provenance>();
  const listeners = createListeners();
  let snapshot: Readonly<Record<string, unknown>> = Object.freeze(
    Object.fromEntries(values),
  );

  function change(
    patch: Readonly<Record<string, unknown>>,
    origin: "local" | "remote",
  ): void {
    for (const [key, value] of Object.entries(patch)) {
      if (value === UNSET) values.delete(key);
      else values.set(key, value);
    }
    snapshot = Object.freeze(Object.fromEntries(values));
    listeners.tell(Object.keys(patch), origin);
  }

  return Object.freeze({
    read: () => snapshot,
    provenance: (key: string): Provenance | null =>
      provenances.get(key) ?? null,
    write(patch: Readonly<Record<string, unknown>>): void {
      // a value written here was set by this person, so the record of who set the one before goes
      for (const key of Object.keys(patch)) provenances.delete(key);
      change(patch, "local");
    },
    receive(
      patch: Readonly<Record<string, unknown>>,
      byUserId: string | null,
    ): void {
      for (const key of Object.keys(patch))
        provenances.set(key, {
          at: null,
          on: null,
          byUserId,
          was: values.get(key) ?? null,
        });
      change(patch, "remote");
    },
    subscribe: listeners.subscribe,
    canWrite: options.writable,
  });
}
