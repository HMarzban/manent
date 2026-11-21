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
import type { SyncClient } from "@manent/sync-client";
import { LIBRARY_WORDS, createMessageQueue, createValue } from "@manent/ui";
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
import { createMemoryLibrary } from "./memory-library.ts";
import { createCommands } from "./person-commands.ts";
import type { CommandsOptions } from "./person-commands.ts";
import type {
  DocumentSource,
  FixedKey,
  PersonServices,
  Reverses,
} from "./ports.ts";
import { createRemoteDeferral } from "./remote-deferral.ts";
import { createSyncDocumentSource } from "./sync/document-source.ts";
import type { ReviewPort } from "./sync/document-source.ts";

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

/** The person's maps and values kept in this origin's storage; `dispose` stops each map listening to other tabs. */
function createKept(options: Options) {
  const { storage, storageEvents: events } = options;
  const { userId } = options.person;
  const maps = {
    // until sync keeps these two maps in the person's private index
    prefs: createLocalMap({ storage, key: `manent.prefs.${userId}`, events }),
    keys: createLocalMap({ storage, key: `manent.keys.${userId}`, events }),
    device: createDeviceBag({ storage, userId, events }),
    flags: createFlags({ storage, userId, events }),
  };
  const lastPane = createLocalText({
    storage,
    key: `manent.prefs.last-pane.${userId}`,
  });
  return {
    ...maps,
    lastPane: {
      get: () => SECTION_IDS.find((id) => id === lastPane.get()) ?? "writing",
      set: lastPane.set,
    },
    dispose() {
      for (const map of Object.values(maps)) map.dispose();
    },
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
 * Until the Library creates each script in its project, a script this device opens that it has never held is
 * created on the server in a project of its own at its first sync.
 */
function creatingScripts(
  client: SyncClient,
  projectHome: (docId: string) => string,
): SyncClient {
  return {
    link: client.link,
    open: (docId, options) =>
      client.open(docId, {
        create: { kind: "script", home: projectHome(docId), workspaceId: null },
        ...options,
      }),
    create: (request) => client.create(request),
    documents: () => client.documents(),
    setOnline: (wanted) => client.setOnline(wanted),
    retryNow: () => client.retryNow(),
    view: (docId) => client.view(docId),
    close: () => client.close(),
  };
}

// until the review entries are read from the person's private index
const NO_REVIEW: ReviewPort = Object.freeze({
  openCount: () => createValue(0),
  follow: () => () => {},
});

/**
 * `person`'s services over `storage` and the person's sync, started here; `dispose` stops listening to other tabs,
 * drops every open document's store and disposes the sync.
 */
export function createPersonServices(options: Options): PersonServices {
  const kept = createKept(options);
  const deviceId = readDeviceId(options.storage, options.randomId);
  // the protocol is loaded apart from the entry
  const sync = Promise.all([
    options.startSync(options.person, deviceId),
    import("@manent/sync-protocol"),
  ]).then(([s, { projectHome }]) => ({
    ...s,
    client: creatingScripts(s.client, projectHome),
  }));
  const client = sync.then((s) => s.client);
  void client.catch(() => {
    // each document's status says a sync that cannot start, and an editor keeps the page it shows
  });
  const messages = createMessageQueue({
    now: options.now,
    schedule: options.schedule,
  });
  const documents = createSyncDocumentSource({
    sync,
    review: NO_REVIEW,
    titles: (docId) =>
      library.documentTitle(docId).get() ?? LIBRARY_WORDS.untitledScript,
    messages,
    now: options.now,
    schedule: options.schedule,
    removedInfo: (docId) => options.api.removedDoc(docId),
  });
  // until sync supplies the Library's index
  const library = createMemoryLibrary({
    ids: options.randomId,
    documents,
    language: options.language,
  });
  const { settings, scripts } = createStores(
    options,
    { prefs: kept.prefs, device: kept.device, deviceId },
    documents,
  );
  const resolved = createResolved(kept.keys, options.where);
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
  const fixedKeys = createValue<readonly FixedKey[]>([]);
  const services: PersonServices = {
    userId: options.person.userId,
    settings,
    commands,
    resolved,
    library,
    documents: scripts.documents,
    openScriptStore: scripts.openScriptStore,
    messages,
    flags: kept.flags,
    keys: kept.keys,
    lastPane: kept.lastPane,
    place,
    get persisted() {
      return [kept.device, kept.prefs, kept.keys].every((k) => k.persisted);
    },
    fixedKeys,
    reverses: createReverses(messages),
    editor: control,
    mount: createLazyMount(() =>
      options.loadEditor(options, {
        services: () => services,
        control,
        commands,
        messages,
        resolved,
        fixedKeys,
        navigate: (path) => options.router.navigate(path),
        client,
      }),
    ),
    dispose() {
      stopKeeping();
      stop();
      kept.dispose();
      scripts.clear();
      void sync.then(
        (s) => s.dispose(),
        () => {
          // a sync that never started holds nothing to dispose
        },
      );
    },
  };
  fillHandlers(services);
  return services;
}
