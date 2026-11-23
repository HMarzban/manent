// The settings store: resolves, writes, holds and resets values over one bag per scope, supplied by the app.
import type { SettingsRegistry } from "./registry.ts";
import type { SETTINGS } from "./settings.ts";
import type { Scope, SettingDefinition } from "./types.ts";

/** Written to a bag in place of a value to clear it, so that the setting reads its default again. */
export const UNSET: unique symbol = Symbol("unset");

/**
 * Where a stored value came from: when (milliseconds since the epoch), on which device (its name; null for
 * this device), by whom, and the value it replaced. Each is null when the bag does not know it.
 */
export interface Provenance {
  at: number | null;
  on: string | null;
  byUserId: string | null;
  was: unknown;
}

/**
 * The stored values of one scope. `write` applies a patch at once, a value or UNSET per key, and tells every
 * subscriber with origin "local"; a change made in another tab or on another device arrives as "remote".
 */
export interface Bag {
  read(): Readonly<Record<string, unknown>>;
  provenance(key: string): Provenance | null;
  write(patch: Readonly<Record<string, unknown>>): void;
  subscribe(
    listener: (keys: readonly string[], origin: "local" | "remote") => void,
  ): () => void;
  canWrite(key: string): boolean;
}

export interface Explained<T> {
  value: T;
  source: "own" | "default";
  modified: boolean;
  writable: boolean;
  provenance: Provenance | null;
}

export type SetResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid" | "read_only" | "needs_authority";
      message: string;
    };

/** What a reset replaced, key by key, so that it can be put back. */
export interface ResetReceipt {
  readonly entries: readonly { key: string; was: unknown }[];
}

/** A control in use: `preview` changes what the store answers without writing; `commit` writes the last preview once; `cancel` puts back what the bag holds. */
export interface Hold<T> {
  preview(value: T): void;
  commit(): void;
  cancel(): void;
}

type AnyRegistry = SettingsRegistry<readonly SettingDefinition[]>;
type KeyOf<R extends AnyRegistry> = R["all"][number]["key"];
type ValueOf<R extends AnyRegistry, K extends KeyOf<R>> = Extract<
  R["all"][number],
  { readonly key: K }
>["default"];

export type SettingKey = KeyOf<typeof SETTINGS>;
/** The value type of setting `K`. */
export type SettingValue<K extends SettingKey> = ValueOf<typeof SETTINGS, K>;

/** Typed by `SETTINGS` unless another registry is given (a test's fixture). */
export interface SettingsStore<R extends AnyRegistry = typeof SETTINGS> {
  get<K extends KeyOf<R>>(key: K): ValueOf<R, K>;
  explain<K extends KeyOf<R>>(key: K): Explained<ValueOf<R, K>>;
  set<K extends KeyOf<R>>(key: K, value: ValueOf<R, K>): SetResult;
  /** While a key is held, a remote change to it waits: a commit drops it, a cancel applies it. */
  hold<K extends KeyOf<R>>(key: K): Hold<ValueOf<R, K>>;
  /** Clears one key, or every modified key of a scope. */
  reset(target: KeyOf<R> | { scope: Scope }): ResetReceipt;
  /** Puts back each entry whose key still holds no value of its own since the reset. */
  restore(receipt: ResetReceipt): void;
  /** Per key; there is no listener for every key. */
  subscribe(key: KeyOf<R>, listener: () => void): () => void;
  /** The keys of a scope whose own value differs from the default. */
  modified(scope: Scope): readonly KeyOf<R>[];
}

interface Resolved {
  value: unknown;
  source: "own" | "default";
}

interface KeyState {
  readonly def: SettingDefinition;
  readonly bag: Bag | null;
  /** The bag's value as last applied: a remote change lands when `deferRemote` says so. */
  stored: Resolved;
  held: { preview: Resolved | null } | null;
  readonly listeners: Set<() => void>;
}

interface StoreOptions<R extends AnyRegistry> {
  registry: R;
  bags: { personal: Bag; device: Bag; script: Bag | null; project: Bag | null };
  beforeWrite: (key: string) => void;
  deferRemote: (apply: () => void) => void;
  locked: (key: string) => boolean;
}

type Refusal = Extract<SetResult, { ok: false }>;

function resolve(def: SettingDefinition, bag: Bag | null): Resolved {
  const parsed = bag === null ? null : def.type.parse(bag.read()[def.key]);
  return parsed?.ok === true
    ? { value: parsed.value, source: "own" }
    : { value: def.default, source: "default" };
}

const current = (state: KeyState): Resolved =>
  state.held?.preview ?? state.stored;

function isModified(state: KeyState): boolean {
  const { value, source } = current(state);
  return source === "own" && !state.def.type.equals(value, state.def.default);
}

function notify(state: KeyState): void {
  for (const listener of state.listeners) listener();
}

function apply(state: KeyState): void {
  state.stored = resolve(state.def, state.bag);
  notify(state);
}

const readOnly = (def: SettingDefinition): Refusal => ({
  ok: false,
  reason: "read_only",
  message:
    def.scope === "script"
      ? "Only editors can change script settings."
      : `${def.key} cannot be written in this bag`,
});

class BagStore<R extends AnyRegistry> implements SettingsStore<R> {
  private readonly options: StoreOptions<R>;
  private readonly states: ReadonlyMap<string, KeyState>;

  constructor(options: StoreOptions<R>) {
    this.options = options;
    const { registry, bags } = options;
    this.states = new Map(
      registry.all.map((def) => {
        const bag = bags[def.scope];
        const state: KeyState = {
          def,
          bag,
          stored: resolve(def, bag),
          held: null,
          listeners: new Set(),
        };
        return [def.key, state];
      }),
    );
    for (const bag of new Set([
      bags.personal,
      bags.device,
      bags.script,
      bags.project,
    ]))
      bag?.subscribe((keys, origin) => this.changed(bag, keys, origin));
  }

  get<K extends KeyOf<R>>(key: K): ValueOf<R, K> {
    // every value held here passed its definition's `type.parse`, or came from a caller typed by it
    return current(this.stateOf(key)).value as ValueOf<R, K>;
  }

  explain<K extends KeyOf<R>>(key: K): Explained<ValueOf<R, K>> {
    const state = this.stateOf(key);
    return {
      value: this.get(key),
      source: current(state).source,
      modified: isModified(state),
      writable: this.target(state).ok,
      provenance: state.bag === null ? null : state.bag.provenance(key),
    };
  }

  set<K extends KeyOf<R>>(key: K, value: ValueOf<R, K>): SetResult {
    return this.put(this.stateOf(key), value);
  }

  hold<K extends KeyOf<R>>(key: K): Hold<ValueOf<R, K>> {
    const state = this.stateOf(key);
    const held: { preview: Resolved | null } = { preview: null };
    state.held = held;
    // false once this hold has ended, or a later hold of the key has replaced it
    const release = (): boolean => {
      if (state.held !== held) return false;
      state.held = null;
      return true;
    };
    return {
      preview: (value) => {
        if (state.held !== held) return;
        held.preview = { value, source: "own" };
        notify(state);
      },
      commit: () => {
        if (!release()) return;
        const { preview } = held;
        if (preview === null || !this.put(state, preview.value).ok)
          apply(state);
      },
      cancel: () => {
        if (release()) apply(state);
      },
    };
  }

  reset(target: KeyOf<R> | { scope: Scope }): ResetReceipt {
    const keys =
      typeof target === "string" ? [target] : this.modified(target.scope);
    const entries: { key: string; was: unknown }[] = [];
    for (const key of keys) {
      const state = this.stateOf(key);
      const writable = this.target(state);
      if (!writable.ok) continue;
      if (state.stored.source === "own")
        entries.push({ key, was: state.stored.value });
      this.write(writable.bag, key, UNSET);
    }
    return { entries };
  }

  restore(receipt: ResetReceipt): void {
    for (const { key, was } of receipt.entries) {
      const writable = this.target(this.stateOf(key));
      if (writable.ok && !Object.hasOwn(writable.bag.read(), key))
        this.write(writable.bag, key, was);
    }
  }

  subscribe(key: KeyOf<R>, listener: () => void): () => void {
    const { listeners } = this.stateOf(key);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  modified(scope: Scope): readonly KeyOf<R>[] {
    return this.options.registry
      .byScope(scope)
      .map((def) => def.key)
      .filter((key): key is KeyOf<R> => this.states.has(key))
      .filter((key) => isModified(this.stateOf(key)));
  }

  private stateOf(key: string): KeyState {
    const state = this.states.get(key);
    if (state === undefined)
      throw new RangeError(`no setting is registered as ${key}`);
    return state;
  }

  private target(state: KeyState): { ok: true; bag: Bag } | Refusal {
    const { def, bag } = state;
    if (bag === null || !bag.canWrite(def.key)) return readOnly(def);
    if (def.guard === "layout" && this.options.locked(def.key))
      return {
        ok: false,
        reason: "needs_authority",
        message: `${def.key} changes the layout of a script whose page numbers are locked`,
      };
    return { ok: true, bag };
  }

  private write(bag: Bag, key: string, value: unknown): void {
    this.options.beforeWrite(key);
    bag.write({ [key]: value });
  }

  private put(state: KeyState, value: unknown): SetResult {
    const { key } = state.def;
    const parsed = state.def.type.parse(value);
    if (!parsed.ok)
      return {
        ok: false,
        reason: "invalid",
        message: `${key} refuses the value: ${parsed.reason}`,
      };
    const writable = this.target(state);
    if (!writable.ok) return writable;
    this.write(writable.bag, key, parsed.value);
    return { ok: true };
  }

  private changed(
    bag: Bag,
    keys: readonly string[],
    origin: "local" | "remote",
  ): void {
    // a key the registry does not hold is carried by the bag and ignored here; a held key waits for release
    const changed = keys.flatMap((key) => {
      const state = this.states.get(key);
      return state?.bag === bag && state.held === null ? [state] : [];
    });
    if (changed.length === 0) return;
    if (origin === "local") changed.forEach(apply);
    else
      this.options.deferRemote(() =>
        changed.filter((state) => state.held === null).forEach(apply),
      );
  }
}

/**
 * The store over `registry`. `beforeWrite` runs before every write to a bag (the app's keystroke guard);
 * `deferRemote` decides when a change from elsewhere lands; `locked` says whether page numbers are locked,
 * which makes a layout-guarded key need the authority.
 */
export function createSettingsStore<R extends AnyRegistry>(
  options: StoreOptions<R>,
): SettingsStore<R> {
  return new BagStore(options);
}
