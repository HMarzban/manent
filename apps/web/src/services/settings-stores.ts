// The person's settings store, and one settings store per open document with its script settings.
import {
  SETTINGS,
  createPersonalBag,
  createSettingsStore,
} from "@manent/settings";
import type { Bag, KeyValueMap, SettingsStore } from "@manent/settings";
import { deviceName } from "../platform.ts";
import { productionContextActions } from "../state/production-context.store.ts";
import type { CommandsOptions } from "./person-commands.ts";
import type { DocumentSource } from "./ports.ts";
import { createRemoteDeferral } from "./remote-deferral.ts";

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

/** The person's settings store, and one store per open document of `source` with its script settings. */
export function createStores(
  options: CommandsOptions,
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
