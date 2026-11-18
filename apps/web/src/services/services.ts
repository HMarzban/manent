// One person's services in this tab, composed once: each port's implementation is picked on one line, until sync and the editor supply their own.
import {
  COMMANDS,
  createCommandService,
  isChord,
  resolveBindings,
} from "@manent/commands";
import type {
  CommandContext,
  CommandService,
  CustomBinding,
  Keys,
  Resolved,
  SettingWriter,
} from "@manent/commands";
import {
  SECTION_IDS,
  SETTINGS,
  createPersonalBag,
  createSettingsStore,
  latestEntries,
} from "@manent/settings";
import type { Bag, KeyValueMap, SettingsStore } from "@manent/settings";
import { createMessageQueue, createValue, messageFor } from "@manent/ui";
import type { MessageQueue, Subscribable } from "@manent/ui";
import type { Api } from "../api.ts";
import type { EditorMount } from "../editor-host/mount.ts";
import { placeholderMount } from "../editor-host/placeholder-mount.ts";
import { createHandlers } from "../handlers/index.ts";
import type { Navigation } from "../handlers/index.ts";
import { deviceName } from "../platform.ts";
import type { Where } from "../platform.ts";
import type { TabPerson } from "../session.ts";
import type { PersonStore } from "../state/person.store.ts";
import { productionContextActions } from "../state/production-context.store.ts";
import { createDeviceBag } from "./device-bag.ts";
import { readDeviceId } from "./device-id.ts";
import { createFlags } from "./flags.ts";
import { createLocalDocumentSource } from "./local-document-source.ts";
import { createLocalMap, createLocalText } from "./local-map.ts";
import { createMemoryLibrary } from "./memory-library.ts";
import type {
  DocumentSource,
  Environment,
  PersonServices,
  Reverses,
} from "./ports.ts";
import { createRemoteDeferral } from "./remote-deferral.ts";

// until the editor supplies its own mount
export const editorMount: EditorMount = placeholderMount;

type Options = Environment & {
  person: TabPerson;
  demo: boolean;
  api: Api;
  usePerson: PersonStore;
  router: Navigation;
};

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

/** What a command may know: the window's state from the shell, the focus and connection read now, and the person's. */
function commandContext(options: Options): CommandContext {
  const { docId, screen, panels, historyPresent } = options.shellState.get();
  return {
    screen,
    focus: options.dom.focusKind(),
    docOpen: docId !== null,
    // every person edits every document until sync supplies roles
    role: docId === null ? null : "editor",
    online: options.online(),
    platform: options.where.platform,
    shell: options.where.shell,
    demo: options.demo,
    signedIn: (options.usePerson.getState().person?.token ?? null) !== null,
    panelOpen: { left: panels.left !== null, side: panels.side !== null },
    historyPresent,
    production: docId === null ? null : productionContextActions.get(docId),
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
  kept: { prefs: KeyValueMap; device: Bag },
  source: DocumentSource,
): { settings: SettingsStore; scripts: ScriptStores } {
  const { now, schedule, where } = options;
  const personal = createPersonalBag({
    map: kept.prefs,
    deviceId: readDeviceId(options.storage, options.randomId),
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

/**
 * The command service over `COMMANDS` and the handlers `fillHandlers` makes, told of every change to the window's state, the
 * person, the bindings and the settings; a setting command writes the open document's store, so a script setting reaches its script.
 */
function createCommands(
  options: Options,
  parts: {
    settings: SettingsStore;
    openScriptStore(docId: string): SettingsStore;
    messages: MessageQueue;
    resolved: Subscribable<Resolved>;
  },
): {
  commands: CommandService;
  fillHandlers(services: PersonServices): void;
  stop(): void;
} {
  const { settings, messages, resolved } = parts;
  // filled once the services exist, before anything can run a command
  const handlers: Record<string, () => void> = {};
  const settingsHere = (): SettingWriter => {
    const { docId } = options.shellState.get();
    return docId === null ? settings : parts.openScriptStore(docId);
  };
  const service = createCommandService({
    commands: COMMANDS,
    handlers,
    context: () => commandContext(options),
    settings: {
      get: (key) => settingsHere().get(key),
      set: (key, value) => settingsHere().set(key, value),
    },
    bindings: () => resolved.get().effective,
    onDisabled: (label, reason) =>
      messages.push(messageFor({ kind: "command_unavailable", label, reason })),
  });
  const unsubscribers = [
    options.shellState.subscribe(service.notify),
    options.usePerson.subscribe(service.notify),
    resolved.subscribe(service.notify),
    ...SETTINGS.all.map((def) => settings.subscribe(def.key, service.notify)),
  ];
  return {
    commands: {
      run(id, from) {
        const result = service.run(id, from);
        if (result === "ran") options.ran(id);
        return result;
      },
      state: service.state,
      subscribe: service.subscribe,
    },
    fillHandlers(services) {
      const shellState = options.shellState.get;
      Object.assign(
        handlers,
        createHandlers({ ...options, services, shellState }),
      );
    },
    stop() {
      for (const unsubscribe of unsubscribers) unsubscribe();
    },
  };
}

/** `person`'s services over `storage`; `dispose` stops listening to other tabs and drops every open document's store. */
export function createPersonServices(options: Options): PersonServices {
  const kept = createKept(options);
  // until sync supplies the Library's index and the documents
  const localDocuments = createLocalDocumentSource({
    now: options.now,
    shell: options.where.shell,
  });
  const library = createMemoryLibrary({
    ids: options.randomId,
    documents: localDocuments,
    language: options.language,
  });
  const { settings, scripts } = createStores(options, kept, localDocuments);
  const messages = createMessageQueue({
    now: options.now,
    schedule: options.schedule,
  });
  const resolved = createResolved(kept.keys, options.where);
  const { commands, fillHandlers, stop } = createCommands(options, {
    settings,
    openScriptStore: scripts.openScriptStore,
    messages,
    resolved,
  });
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
    get persisted() {
      return [kept.device, kept.prefs, kept.keys].every((k) => k.persisted);
    },
    // empty until the editor supplies its structural and picker keys
    fixedKeys: [],
    reverses: createReverses(messages),
    dispose() {
      stop();
      kept.dispose();
      scripts.clear();
    },
  };
  fillHandlers(services);
  return services;
}
