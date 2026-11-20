// One person's services in this tab, composed once: each port's implementation is picked on one line, until sync and the editor supply their own.
import { COMMANDS, isChord, resolveBindings } from "@manent/commands";
import type {
  CommandService,
  CustomBinding,
  Keys,
  Resolved,
} from "@manent/commands";
import {
  SECTION_IDS,
  SETTINGS,
  createPersonalBag,
  createSettingsStore,
  latestEntries,
} from "@manent/settings";
import type { Bag, KeyValueMap, SettingsStore } from "@manent/settings";
import { createKeyResolver, createMessageQueue, createValue } from "@manent/ui";
import type { MessageQueue, StatusFacts, Subscribable } from "@manent/ui";
import { createEditorControl } from "../editor-host/control.ts";
import type { OpenEditor } from "../editor-host/editor-mount.ts";
import { createLazyMount } from "../editor-host/lazy-mount.ts";
import type { EditorMount } from "../editor-host/mount.ts";
import { createEditorKeyRun } from "../handlers/editor.ts";
import { deviceName } from "../platform.ts";
import type { Where } from "../platform.ts";
import type { TabPerson } from "../session.ts";
import { productionContextActions } from "../state/production-context.store.ts";
import { createDeviceBag } from "./device-bag.ts";
import { readDeviceId } from "./device-id.ts";
import { createFlags } from "./flags.ts";
import { createLocalDocumentSource } from "./local-document-source.ts";
import { createLocalMap, createLocalText } from "./local-map.ts";
import { createMemoryLibrary } from "./memory-library.ts";
import { createCommands } from "./person-commands.ts";
import type { CommandsOptions } from "./person-commands.ts";
import type {
  DocumentSource,
  EditorParts,
  Environment,
  FixedKey,
  PersonServices,
  Reverses,
} from "./ports.ts";
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

/** The editor's modules, and the schema with ProseMirror's model, which stay out of the entry; the hooks in the test build. */
const loadEditorModules = (flavour: Options["flavour"]) =>
  Promise.all([
    import("../editor-host/editor-mount.ts"),
    import("../editor-host/editor-sessions.ts"),
    import("@manent/schema"),
    flavour === "test" ? import("../editor-host/test-hooks.ts") : null,
  ]);

/** The editor's keys: a chord is looked up in the person's editor table and runs its command. */
function editorKeys(
  commands: CommandService,
  messages: MessageQueue,
  resolved: Subscribable<Resolved>,
) {
  return {
    resolve: createKeyResolver({ table: () => resolved.get().editorTable }),
    run: createEditorKeyRun({
      commands,
      messages,
      labelOf: (id) => commands.state(id).label,
    }),
  };
}

/**
 * The page's editor, from modules loaded apart from the entry; `fixedKeys` gets the editor's keys once they have
 * loaded. In the test build the editor's hooks are installed on the page's `__manent`.
 */
export async function loadEditor(
  environment: Environment,
  parts: EditorParts,
): Promise<EditorMount> {
  const timers = { now: environment.now, schedule: environment.schedule };
  const frames = { request: environment.frame };
  const [mounts, { createLocalSessions }, { randomBlockId }, hooks] =
    await loadEditorModules(environment.flavour);
  parts.fixedKeys.set(mounts.EDITOR_FIXED_KEYS);
  const sessions = createLocalSessions({
    frames,
    clock: timers,
    ids: randomBlockId,
  });
  const access = new Map<string, StatusFacts["access"]>();
  let current: OpenEditor | null = null;
  const target: unknown = Reflect.get(globalThis, "__manent");
  if (hooks !== null && typeof target === "object" && target !== null)
    hooks.installEditorHooks(target, {
      services: parts.services(),
      navigate: parts.navigate,
      current: () => current,
      sessions,
      access,
    });
  return mounts.createEditorMount({
    sessions,
    services:
      hooks === null
        ? parts.services
        : () => hooks.withRecordedAccess(parts.services(), access),
    control: parts.control,
    keys: editorKeys(parts.commands, parts.messages, parts.resolved),
    ports: mounts.browserPagePorts(environment.userAgent),
    frames,
    timers,
    platform: environment.where.platform,
    ids: randomBlockId,
    random: environment.randomId,
    observe:
      hooks === null
        ? undefined
        : (open) => {
            current = open;
          },
  });
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
  const control = createEditorControl();
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
      }),
    ),
    dispose() {
      stop();
      kept.dispose();
      scripts.clear();
    },
  };
  fillHandlers(services);
  return services;
}
