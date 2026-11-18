// A person's maps and values kept in this origin's storage, shared by its tabs: a change in one tab reaches the others.
import type { KeyValueMap } from "@manent/settings";

/** Calls `listener` with the storage key another tab changed, or null when it cleared the storage; returns the unsubscriber. */
export type StorageEvents = (
  listener: (key: string | null) => void,
) => () => void;

/** A map whose JSON object is one storage item; `persisted` turns false once the storage refuses it. */
interface LocalMap extends KeyValueMap {
  readonly persisted: boolean;
  remove(key: string): void;
  dispose(): void;
}

type Listener = Parameters<KeyValueMap["subscribe"]>[0];

// the same guard as the schema's own, which that package does not export
const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The JSON value of `raw`; null when there is none or it is not JSON. */
function parseJson(raw: string | null): unknown {
  try {
    return raw === null ? null : JSON.parse(raw);
  } catch {
    // not JSON: read as nothing stored
    return null;
  }
}

/** One map over `storage[key]`; storage that is missing or refuses keeps the map for this session only. */
export function createLocalMap(options: {
  storage: Storage | null;
  key: string;
  events: StorageEvents;
}): LocalMap {
  const { storage, key } = options;
  let persisted = storage !== null;
  const listeners = new Set<Listener>();

  const load = (): Map<string, unknown> => {
    let raw: string | null = null;
    try {
      raw = storage?.getItem(key) ?? null;
    } catch {
      // the storage refuses to be read: the map lives in memory
      persisted = false;
    }
    const parsed = parseJson(raw);
    return new Map(isObject(parsed) ? Object.entries(parsed) : []);
  };
  let values = load();

  const tell = (keys: readonly string[], origin: "local" | "remote"): void => {
    for (const listener of listeners) listener(keys, origin);
  };
  const save = (): void => {
    try {
      storage?.setItem(key, JSON.stringify(Object.fromEntries(values)));
    } catch {
      // a full or refusing storage: the values stay in memory for this session
      persisted = false;
    }
  };
  const stopListening = options.events((changed) => {
    if (changed !== null && changed !== key) return;
    const before = values;
    values = load();
    const keys = [...new Set([...before.keys(), ...values.keys()])].filter(
      (k) => JSON.stringify(before.get(k)) !== JSON.stringify(values.get(k)),
    );
    if (keys.length > 0) tell(keys, "remote");
  });

  return {
    get persisted() {
      return persisted;
    },
    get: (k) => values.get(k),
    set(k, value) {
      values.set(k, value);
      save();
      tell([k], "local");
    },
    remove(k) {
      if (!values.delete(k)) return;
      save();
      tell([k], "local");
    },
    keys: () => [...values.keys()],
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: stopListening,
  };
}

/** One text in `storage[key]`; null when there is none or the storage refuses. */
export function createLocalText(options: {
  storage: Storage | null;
  key: string;
}): { get(): string | null; set(value: string): void } {
  const { storage, key } = options;
  let kept: string | null = null;
  return {
    get() {
      try {
        return storage?.getItem(key) ?? kept;
      } catch {
        // the storage refuses: what this session set is all there is
        return kept;
      }
    },
    set(value) {
      kept = value;
      try {
        storage?.setItem(key, value);
      } catch {
        // a full or refusing storage: the value lasts for this session
      }
    },
  };
}

/** This origin's storage, or null when the browser refuses it, and the storage events of the other tabs. */
export function browserStorage(win: Window): {
  storage: Storage | null;
  events: StorageEvents;
} {
  let storage: Storage | null;
  try {
    storage = win.localStorage;
  } catch {
    // the browser refuses storage: preferences last for this session
    storage = null;
  }
  return {
    storage,
    events(listener) {
      const onStorage = (event: StorageEvent): void => {
        if (event.storageArea === storage) listener(event.key);
      };
      win.addEventListener("storage", onStorage);
      return () => win.removeEventListener("storage", onStorage);
    },
  };
}
