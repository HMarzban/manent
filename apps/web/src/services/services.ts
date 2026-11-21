// One person's services in this tab, composed once: each port's implementation is picked on one line, until sync and the editor supply their own.
import { COMMANDS, isChord, resolveBindings } from "@manent/commands";
import type { CustomBinding, Keys, Resolved } from "@manent/commands";
import {
  SECTION_IDS,
  SETTINGS,
  createPersonalBag,
  createSettingsStore,
  latestEntries,
} from "@manent/settings";
import type { Bag, KeyValueMap, SettingsStore } from "@manent/settings";
import { createMessageQueue, createValue } from "@manent/ui";
import type { MessageQueue, Subscribable } from "@manent/ui";
import { createEditorControl } from "../editor-host/control.ts";
import { createLazyMount } from "../editor-host/lazy-mount.ts";
import {
  createPlaceStore,
  keepViewState,
  placeKey,
} from "../editor-host/place.ts";
import type { PlaceStore } from "../editor-host/place.ts";
import { deviceName } from "../platform.ts";
import type { Where } from "../platform.ts";
import type { TabPerson } from "../session.ts";
import { productionContextActions } from "../state/production-context.store.ts";
import { createDeviceBag } from "./device-bag.ts";
import { readDeviceId } from "./device-id.ts";
import { createFlags } from "./flags.ts";
import { createLocalMap, createLocalText } from "./local-map.ts";
import { createCommands } from "./person-commands.ts";
import type { CommandsOptions } from "./person-commands.ts";
import type {
  DocumentSource,
  FixedKey,
  PersonServices,
  Reverses,
} from "./ports.ts";
import { createPersonDocuments } from "./person-documents.ts";
import { createRemoteDeferral } from "./remote-deferral.ts";

type Options = CommandsOptions & { person: TabPerson };

const isKeys = (value: unknown): value is Keys =>
  Array.isArray(value) &&
  value.every((chord) => typeof chord === "string" && isChord(chord));

/** The bindings of `COMMANDS` with the person's own, read again whenever `keys` changes. */
function createResolved(
  keys: KeyValueMap,
  where: Where,
): Subscribable<Resolved> {
  const custom = (): CustomBinding[] =>
    [
      ...latestEntries(
        Object.fromEntries(keys.keys().map((key) => [key, keys.get(key)])),
      ),
    ].flatMap(([commandId, entry]) =>
      // a cleared entry gives the default back
      !entry.unset && isKeys(entry.v)
        ? [{ commandId, keys: entry.v, at: entry.at }]
        : [],
    );
  const resolve = (): Resolved =>
    resolveBindings({
      commands: COMMANDS,
      custom: custom(),
      platform: where.platform,
      shell: where.shell,
      // no check has refused a chord on this device until the key probe runs
      findings: { failsHere: new Set() },
    });
  const resolved = createValue(resolve());
  keys.subscribe(() => resolved.set(resolve()));
  return resolved;
}

/** Each reverse lasts until it runs, or until the queue holds no message at all. */
function createReverses(messages: MessageQueue): Reverses {
  const reverses = new Map<string, () => void>();
  messages.subscribe(() => {
    if (messages.current() === null) reverses.clear();
  });
  return {
    set(messageId, reverse) {
      reverses.set(messageId, reverse);
    },
    run(messageId) {
      const reverse = reverses.get(messageId);
      if (reverse === undefined) return false;
      reverses.delete(messageId);
      reverse();
      return true;
    },
  };
}

/** Views of bags that outlive their store; `release` ends every subscription made through them, so a dropped store stops hearing them. */
function createBagViews(): { view(bag: Bag): Bag; release(): void } {
  const unsubscribers: (() => void)[] = [];
  return {
    view: (bag) => ({
      read: () => bag.read(),
      provenance: (key) => bag.provenance(key),
      write: (patch) => bag.write(patch),
      subscribe(listener) {
        const unsubscribe = bag.subscribe(listener);
        unsubscribers.push(unsubscribe);
        return unsubscribe;
      },
      canWrite: (key) => bag.canWrite(key),
    }),
    release() {
      for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
    },
  };
}

interface ScriptStore {
  store: SettingsStore;
  release(): void;
}

interface ScriptStores {
  documents: DocumentSource;
  openScriptStore(docId: string): SettingsStore;
  clear(): void;
}

/** The open documents, counted, and one settings store per open document, released when its last opener closes it. */
function createScriptStores(options: {
  source: DocumentSource;
  store: (scriptBag: Bag, docId: string) => ScriptStore;
}): ScriptStores {
  const { source } = options;
  const opens = new Map<string, number>();
  const stores = new Map<string, ScriptStore>();
  return {
    documents: {
      open(docId) {
        opens.set(docId, (opens.get(docId) ?? 0) + 1);
        return source.open(docId);
      },
      close(docId) {
        const left = (opens.get(docId) ?? 1) - 1;
        if (left > 0) {
          opens.set(docId, left);
          return;
        }
        opens.delete(docId);
        stores.get(docId)?.release();
        stores.delete(docId);
        source.close(docId);
      },
    },
    openScriptStore(docId) {
      const existing = stores.get(docId);
      if (existing !== undefined) return existing.store;
      const created = options.store(source.open(docId).scriptBag, docId);
      stores.set(docId, created);
      return created.store;
    },
    clear() {
      for (const { release } of stores.values()) release();
      stores.clear();
    },
  };
}

/** What the person keeps in this origin's storage, for this device alone; `dispose` stops the bag listening to other tabs. */
function createKept(options: Options) {
  const { storage, storageEvents: events } = options;
  const { userId } = options.person;
  const lastPane = createLocalText({
    storage,
    key: `manent.prefs.last-pane.${userId}`,
  });
  const device = createDeviceBag({ storage, userId, events });
  return {
    device,
    deviceId: readDeviceId(storage, options.randomId),
    lastPane: {
      get: () => SECTION_IDS.find((id) => id === lastPane.get()) ?? "writing",
      set: lastPane.set,
    },
    dispose: device.dispose,
  };
}

/** The person's settings store, and one store per open document of `source` with its script settings. */
function createStores(
  options: Options,
  kept: { prefs: KeyValueMap; device: Bag; deviceId: string },
  source: DocumentSource,
): { settings: SettingsStore; scripts: ScriptStores } {
  const { now, schedule, where } = options;
  const personal = createPersonalBag({
    map: kept.prefs,
    deviceId: kept.deviceId,
    deviceName: deviceName(where) ?? "",
    now,
  });
  const deferRemote = createRemoteDeferral({
    now,
    schedule,
    lastKeyAt: options.lastKeyAt,
  });
  const storeOver = (
    view: (bag: Bag) => Bag,
    script: Bag | null,
    locked: () => boolean,
  ) =>
    createSettingsStore({
      registry: SETTINGS,
      bags: { personal: view(personal), device: view(kept.device), script },
      beforeWrite: () => options.guard.check("settings"),
      deferRemote,
      locked,
    });
  return {
    // the person's own store lives as long as the bags it reads
    settings: storeOver(
      (bag) => bag,
      null,
      () => false,
    ),
    scripts: createScriptStores({
      source,
      store(scriptBag, docId) {
        const { view, release } = createBagViews();
        const locked = () =>
          productionContextActions.get(docId)?.locked === true;
        return { store: storeOver(view, view(scriptBag), locked), release };
      },
    }),
  };
}

// one place store per storage and person for the tab's life: the services built for one person one after another, and an
// editor that earlier services mounted, write through one map and so never over one another's entries
const placeStores = new WeakMap<object, Map<string, PlaceStore>>();
const NO_STORAGE = Object.freeze({});

function placeStoreOf(options: Options): PlaceStore {
  const { storage, storageEvents: events, now, person } = options;
  const byPerson = placeStores.get(storage ?? NO_STORAGE) ?? new Map();
  placeStores.set(storage ?? NO_STORAGE, byPerson);
  const key = placeKey(person.userId);
  const store =
    byPerson.get(person.userId) ??
    createPlaceStore({ map: createLocalMap({ storage, key, events }), now });
  byPerson.set(person.userId, store);
  return store;
}

/**
 * `person`'s services over `storage` and the person's sync, started here; `dispose` stops listening to other tabs,
 * drops every open document's store and disposes the sync.
 */
export function createPersonServices(options: Options): PersonServices {
  const kept = createKept(options);
  const messages = createMessageQueue({
    now: options.now,
    schedule: options.schedule,
  });
  const sync = createPersonDocuments(options, kept.deviceId, messages);
  const { settings, scripts } = createStores(
    options,
    { ...kept, prefs: sync.maps.prefs },
    sync.documents,
  );
  const resolved = createResolved(sync.maps.keys, options.where);
  const flags = createFlags({
    index: sync.maps.flags,
    storage: options.storage,
    userId: options.person.userId,
    events: options.storageEvents,
  });
  const control = createEditorControl();
  const { commands, fillHandlers, stop } = createCommands(options, {
    settings,
    openScriptStore: scripts.openScriptStore,
    messages,
    resolved,
    control,
  });
  const place = placeStoreOf(options);
  const stopKeeping = keepViewState(place, options.schedule);
  // a page left before the private index opened would lose what it wrote into the index's maps
  const flush = (): void => sync.flush();
  globalThis.addEventListener("pagehide", flush);
  const fixedKeys = createValue<readonly FixedKey[]>([]);
  const services: PersonServices = {
    userId: options.person.userId,
    settings,
    commands,
    resolved,
    library: sync.library,
    documents: scripts.documents,
    review: sync.review,
    openScriptStore: scripts.openScriptStore,
    messages,
    flags,
    keys: sync.maps.keys,
    lastPane: kept.lastPane,
    place,
    get persisted() {
      return kept.device.persisted;
    },
    fixedKeys,
    reverses: createReverses(messages),
    editor: control,
    // the editor reads the person's preferences as it mounts, so it waits for their private index
    mount: createLazyMount(async () => {
      await sync.ready;
      return options.loadEditor(options, {
        services: () => services,
        control,
        commands,
        messages,
        resolved,
        fixedKeys,
        navigate: (path) => options.router.navigate(path),
        client: sync.client,
      });
    }),
    ready: sync.ready,
    dispose() {
      globalThis.removeEventListener("pagehide", flush);
      stopKeeping();
      stop();
      kept.dispose();
      flags.dispose();
      scripts.clear();
      sync.dispose();
    },
  };
  fillHandlers(services);
  return services;
}
