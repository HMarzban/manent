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
import type { TabPerson, TabStorage } from "../session.ts";
import type { ShellDom } from "../shell/regions.tsx";
import type { Guard } from "../state/guard.ts";
import type { PersonStore } from "../state/person.store.ts";
import { productionContextActions } from "../state/production-context.store.ts";
import { createDeviceBag } from "./device-bag.ts";
import { readDeviceId } from "./device-id.ts";
import { createFlags } from "./flags.ts";
import { createLocalDocumentSource } from "./local-document-source.ts";
import { createLocalMap, createLocalText } from "./local-map.ts";
import type { StorageEvents } from "./local-map.ts";
import { createMemoryLibrary } from "./memory-library.ts";
import type {
  DocumentSource,
  PersonServices,
  Reverses,
  ShellState,
} from "./ports.ts";
import { createRemoteDeferral } from "./remote-deferral.ts";

/** The world this tab runs in, made once by the composition root and shared by every person's services. */
export interface Environment {
  where: Where;
  /** The language the browser asks for ("en-GB"). */
  language: string;
  now: () => number;
  schedule: (fn: () => void, delayMs: number) => () => void;
  frame: (fn: () => void) => () => void;
  /** This origin's storage; null when the browser refuses it. */
  storage: Storage | null;
  storageEvents: StorageEvents;
  /** This tab's storage, for the boot cache; null when the browser refuses it. */
  tabStorage: TabStorage | null;
  randomId: () => string;
  /** When a key was last pressed in this tab; null before the first. */
  lastKeyAt: () => number | null;
  guard: Guard;
  flavour: "production" | "test";
  shellState: Subscribable<ShellState> & { set(value: ShellState): void };
  dom: ShellDom;
  online: () => boolean;
  /** Told the id of every command that ran. */
  ran: (commandId: string) => void;
  visitUndo: { current: { undo(): boolean } | null };
}

export const INITIAL_SHELL_STATE: ShellState = Object.freeze({
  screen: "library",
  docId: null,
  panels: Object.freeze({ left: null, side: null }),
  historyPresent: false,
});

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

interface ScriptStores {
  documents: DocumentSource;
  openScriptStore(docId: string): SettingsStore;
  clear(): void;
}

/** The open documents, counted, and one settings store per open document, dropped when its last opener closes it. */
function createScriptStores(options: {
  source: DocumentSource;
  store: (scriptBag: Bag, docId: string) => SettingsStore;
}): ScriptStores {
  const { source } = options;
  const opens = new Map<string, number>();
  const stores = new Map<string, SettingsStore>();
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
        stores.delete(docId);
        source.close(docId);
      },
    },
    openScriptStore(docId) {
      const existing = stores.get(docId);
      if (existing !== undefined) return existing;
      const created = options.store(source.open(docId).scriptBag, docId);
      stores.set(docId, created);
      return created;
    },
    clear: () => stores.clear(),
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

/** The person's maps and values kept in this origin's storage. */
function createKept(options: Options) {
  const { storage, storageEvents: events } = options;
  const { userId } = options.person;
  return {
    // until sync keeps these two maps in the person's private index
    prefs: createLocalMap({ storage, key: `manent.prefs.${userId}`, events }),
    keys: createLocalMap({ storage, key: `manent.keys.${userId}`, events }),
    device: createDeviceBag({ storage, userId, events }),
    flags: createFlags({ storage, userId, events }),
    lastPane: createLocalText({
      storage,
      key: `manent.prefs.last-pane.${userId}`,
    }),
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
  const storeOver = (script: Bag | null, locked: () => boolean) =>
    createSettingsStore({
      registry: SETTINGS,
      bags: { personal, device: kept.device, script },
      beforeWrite: () => options.guard.check("settings"),
      deferRemote,
      locked,
    });
  return {
    settings: storeOver(null, () => false),
    scripts: createScriptStores({
      source,
      store: (scriptBag, docId) =>
        storeOver(
          scriptBag,
          () => productionContextActions.get(docId)?.locked === true,
        ),
    }),
  };
}

/**
 * The command service over `COMMANDS` and `handlers`, told of every change to the window's state, the person,
 * the bindings and the settings; a setting command writes the open document's store, so a script setting reaches its script.
 */
function createCommands(
  options: Options,
  parts: {
    handlers: Readonly<Record<string, () => void>>;
    settings: SettingsStore;
    openScriptStore(docId: string): SettingsStore;
    messages: MessageQueue;
    resolved: Subscribable<Resolved>;
  },
): { commands: CommandService; stop(): void } {
  const { settings, messages, resolved } = parts;
  const settingsHere = (): SettingWriter => {
    const { docId } = options.shellState.get();
    return docId === null ? settings : parts.openScriptStore(docId);
  };
  const service = createCommandService({
    commands: COMMANDS,
    handlers: parts.handlers,
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
  // filled once the services exist, before anything can run a command
  const handlers: Record<string, () => void> = {};
  const { commands, stop } = createCommands(options, {
    handlers,
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
    lastPane: {
      get: () =>
        SECTION_IDS.find((id) => id === kept.lastPane.get()) ?? "writing",
      set: kept.lastPane.set,
    },
    get persisted() {
      return [kept.device, kept.prefs, kept.keys].every((k) => k.persisted);
    },
    // empty until the editor supplies its structural and picker keys
    fixedKeys: [],
    reverses: createReverses(messages),
    dispose() {
      stop();
      for (const map of [kept.prefs, kept.keys, kept.device, kept.flags])
        map.dispose();
      scripts.clear();
    },
  };
  Object.assign(
    handlers,
    createHandlers({
      services,
      api: options.api,
      usePerson: options.usePerson,
      router: options.router,
      dom: options.dom,
      shellState: options.shellState.get,
      frame: options.frame,
      visitUndo: options.visitUndo,
    }),
  );
  return services;
}
