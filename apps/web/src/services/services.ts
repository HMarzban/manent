// One person's services in this tab, composed once: each port's implementation is picked on one line, until sync and the editor supply their own.
import { COMMANDS, isChord, resolveBindings } from "@manent/commands";
import type { CustomBinding, Keys, Resolved } from "@manent/commands";
import { SECTION_IDS, latestEntries } from "@manent/settings";
import type { Bag, KeyValueMap } from "@manent/settings";
import type { DocHandle, DocMeta, ViewHandle } from "@manent/sync-client";
import { commentsDocId } from "@manent/sync-protocol";
import { createMessageQueue, createValue } from "@manent/ui";
import type { MessageQueue, Subscribable } from "@manent/ui";
import { createEditorControl } from "../editor-host/control.ts";
import { createLazyMount } from "../editor-host/lazy-mount.ts";
import { browserPagePorts } from "../editor-host/page-ports.ts";
import {
  createPlaceStore,
  keepViewState,
  placeKey,
} from "../editor-host/place.ts";
import type { PlaceStore } from "../editor-host/place.ts";
import { createLazySource } from "../history/lazy-source.ts";
import type { HistorySource } from "../history/source.ts";
import { createTrash } from "../library/trash-api.ts";
import type { Where } from "../platform.ts";
import { openProjectIndex } from "../project/project-index.ts";
import { projectSettingsBag } from "../project/settings-bag.ts";
import type { TabPerson } from "../session.ts";
import { writingActions } from "../state/writing.store.ts";
import {
  createCachedApi,
  invalidateApiCache,
  registerServicesMeta,
} from "./api-cache.ts";
import { createDeviceBag } from "./device-bag.ts";
import { readDeviceId } from "./device-id.ts";
import { createFlags } from "./flags.ts";
import { createLocalMap, createLocalText } from "./local-map.ts";
import { createCommands } from "./person-commands.ts";
import { createPaletteUsage } from "../shell/palette-usage.ts";
import type { CommandsOptions } from "./person-commands.ts";
import type {
  EditorParts,
  FixedKey,
  PersonServices,
  Reverses,
} from "./ports.ts";
import { createPersonDocuments } from "./person-documents.ts";
import type { PersonDocuments } from "./person-documents.ts";
import { createStores } from "./settings-stores.ts";
import { createCloseGuard, createCloseQuestion } from "./sync/close-guard.ts";
import type { CloseGuard } from "./sync/close-guard.ts";
import { documentBlocks } from "./sync/document-blocks.ts";
import { createFavourites } from "./sync/favourites.ts";
import { createFolders } from "./sync/folders.ts";
import { createInkProject } from "./sync/ink-project.ts";

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

/** The settings bag of each script's project over the person's sync; null for a script with none. */
function projectBagOf(sync: PersonDocuments): (docId: string) => Bag | null {
  return (docId) =>
    projectSettingsBag({ docId, client: sync.client, library: sync.library });
}

/** The person's sync, stores, bindings, editor control, command service and view state, wired to one another; `stop` stops keeping the view state and the commands' listening. */
function wirePerson(options: Options) {
  const kept = createKept(options);
  const messages = createMessageQueue({
    now: options.now,
    schedule: options.schedule,
  });
  const sync = createPersonDocuments(options, kept.deviceId, messages);
  const { question, dialog } = createCloseQuestion();
  const guard = createCloseGuard({
    documents: sync.documents,
    dialog,
    run: (commandId) => void commands.run(commandId, "control"),
    now: options.now,
  });
  const { settings, scripts } = createStores(
    options,
    { ...kept, prefs: sync.maps.prefs, projectBag: projectBagOf(sync) },
    guard,
  );
  const resolved = createResolved(sync.maps.keys, options.where);
  const flags = createFlags({ index: sync.maps.flags });
  const control = createEditorControl();
  const paletteUsage = createPaletteUsage({
    userId: options.person.userId,
    storage: options.storage,
    events: options.storageEvents,
  });
  const { commands, fillHandlers, stop } = createCommands(options, {
    settings,
    openScriptStore: scripts.openScriptStore,
    messages,
    resolved,
    control,
    network: sync.network,
    library: sync.library,
    documents: scripts.documents,
    onCommandRan(id, source) {
      if (source === "tour") return;
      paletteUsage.record(id, options.shellState.get().screen, options.now());
    },
  });
  const place = placeStoreOf(options);
  const stopKeeping = keepViewState(place, options.schedule);
  return {
    kept,
    messages,
    sync,
    settings,
    scripts,
    resolved,
    flags,
    control,
    commands,
    fillHandlers,
    place,
    stop() {
      stopKeeping();
      paletteUsage.dispose();
      stop();
    },
    closing: { guard, question },
  };
}

/** Leaves the person's documents when the page is hidden, and has the browser ask before the tab closes while `guard` finds a document this device cannot save. Returns the stop. */
function listenToPage(leave: () => void, guard: CloseGuard): () => void {
  // the browser asks with its own words, which cannot carry Manent's
  const askBeforeClosing = (event: Event): void => {
    if (guard.failing() !== null) event.preventDefault();
  };
  globalThis.addEventListener("pagehide", leave);
  globalThis.addEventListener("beforeunload", askBeforeClosing);
  return () => {
    globalThis.removeEventListener("pagehide", leave);
    globalThis.removeEventListener("beforeunload", askBeforeClosing);
  };
}

/** The person's versions over `open`; history's requests and pages load apart from the entry. */
function createPersonHistory(
  options: Options,
  open: (docId: string) => Promise<DocHandle>,
): HistorySource {
  return createLazySource({
    now: options.now,
    load: async () =>
      (await import("../history/source.ts")).createHistorySource({
        fetch,
        token: () => options.person.token,
        open,
        userId: options.person.userId,
        now: options.now,
        // a request's key is 32 lower-case hex digits
        ids: () => options.randomId().replaceAll("-", ""),
      }),
  });
}

/** The person's editor mounts of the page and of what is beside it, over one editor build made on the first mount. */
function createPersonMounts(
  options: Options,
  ready: Promise<void>,
  parts: EditorParts,
): Pick<PersonServices, "mount" | "besideMount"> {
  // load the editor bundle in parallel with sync.ready, and settle once preferences are attached
  let editorLoad: Promise<
    Pick<PersonServices, "mount" | "besideMount">
  > | null = null;
  const loadedEditor = () =>
    (editorLoad ??= Promise.all([
      options.loadEditor(options, parts),
      ready,
    ]).then(([loaded]) => loaded));
  const href = options.router.here().href;
  if (href.startsWith("/s/") || href.startsWith("/r/")) void loadedEditor();
  return {
    mount: createLazyMount(async () => (await loadedEditor()).mount),
    besideMount: (besideControl) =>
      createLazyMount(async () =>
        (await loadedEditor()).besideMount(besideControl),
      ),
  };
}

function createSyncedParts(options: Options, sync: PersonDocuments) {
  const openHandle = async (docId: string): Promise<DocHandle> =>
    (await sync.client).open(writingActions.openTarget(docId));
  const openComments = async (docId: string, home: string | null) => {
    const client = await sync.client;
    if (home === null) return client.open(commentsDocId(docId));
    const create: NonNullable<DocMeta["create"]> & { scriptDocId: string } = {
      kind: "comments",
      home,
      workspaceId: null,
      scriptDocId: docId,
    };
    return client.open(commentsDocId(docId), { create });
  };
  const viewComments = async (docId: string): Promise<ViewHandle> =>
    (await sync.client).view(commentsDocId(docId));
  return {
    history: createPersonHistory(options, openHandle),
    openHandle,
    openComments,
    viewComments,
    prompter: async (rundownId: string) =>
      (await sync.client).prompter(rundownId),
    async onDevice(docIds: readonly string[]): Promise<ReadonlySet<string>> {
      const held = new Set(
        (await (await sync.client).documents()).map((doc) => doc.docId),
      );
      return new Set(docIds.filter((docId) => held.has(docId)));
    },
    waitingDocuments: async () =>
      (await (await sync.client).documents())
        .filter((doc) => doc.waiting > 0)
        .map(({ docId, waiting }) => ({ docId, waiting })),
    privateIndexSynced: () => sync.privateIndexSynced,
    projectIndex: (projectId: string) =>
      openProjectIndex({ client: sync.client, projectId }),
    folders: createFolders({ client: sync.client }),
    favourites: createFavourites({ client: sync.client }),
    trash: createTrash({ api: options.api }),
    documentBlocks: (docId: string) => documentBlocks(sync.client, docId),
    createInkProject: (
      workspaceId: string,
      input: Parameters<PersonServices["createInkProject"]>[1],
    ) => createInkProject(sync.library, workspaceId, input),
  };
}

/**
 * `person`'s services over `storage` and the person's sync, started here; `dispose` stops listening to other tabs,
 * drops every open document's store and disposes the sync.
 */
export function createPersonServices(options: Options): PersonServices {
  const rawApi = options.api;
  const api = createCachedApi(rawApi, { token: options.person.token });
  const scoped = { ...options, api };
  const wired = wirePerson(scoped);
  const { kept, sync, commands, messages, resolved, control } = wired;
  const stopListening = listenToPage(() => sync.leave(), wired.closing.guard);
  const fixedKeys = createValue<readonly FixedKey[]>([]);
  const services: PersonServices = {
    userId: scoped.person.userId,
    personName: scoped.person.name,
    personSignedIn: scoped.person.token !== null,
    settings: wired.settings,
    commands,
    resolved,
    library: sync.library,
    documents: wired.scripts.documents,
    review: sync.review,
    openScriptStore: wired.scripts.openScriptStore,
    messages,
    flags: wired.flags,
    keys: sync.maps.keys,
    tour: sync.maps.tour,
    api,
    lastPane: kept.lastPane,
    place: wired.place,
    get persisted() {
      return kept.device.persisted;
    },
    fixedKeys,
    reverses: createReverses(messages),
    editor: control,
    ...createPersonMounts(scoped, sync.ready, {
      services: () => services,
      control,
      commands,
      messages,
      resolved,
      fixedKeys,
      navigate: (path) => scoped.router.navigate(path),
      client: sync.client,
    }),
    ...createSyncedParts(scoped, sync),
    writing: writingActions,
    pagePorts: browserPagePorts(scoped.userAgent),
    ready: sync.ready,
    closing: wired.closing,
    connection: sync.connection,
    dispose() {
      invalidateApiCache({ api: rawApi, token: scoped.person.token });
      stopListening();
      wired.stop();
      kept.dispose();
      wired.scripts.clear();
      const id = scoped.person.userId;
      void import("../production/live-services.ts").then((m) =>
        m.disposeProductionServices(id),
      );
      void import("../editor-host/asset-pool.ts").then((m) =>
        m.disposeProjectAssetUploaders(id),
      );
      sync.dispose();
    },
  };
  registerServicesMeta(services, {
    storage: scoped.storage,
    client: sync.client,
  });
  wired.fillHandlers(services);
  return services;
}
