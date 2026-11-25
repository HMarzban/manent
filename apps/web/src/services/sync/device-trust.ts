// What lets the person trust this device with their work: the open marker that tells a crash, the browser asked to
// keep the data, a cleared browser told what came back, the demo's new seed followed before any store opens, and what
// is kept as the page goes.
import type { DocHandle } from "@manent/sync-client";
import { messageFor } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import {
  followDemoSeed,
  readDemoCached,
  reloadAtHome,
} from "../../demo/use-demo.ts";
import type { Where } from "../../platform.ts";
import type { CommandsOptions } from "../person-commands.ts";
import type { PersonSync } from "./create-sync.ts";
import type { LaterMap } from "./later-index.ts";
import type { checkCleared, keepOnDevice } from "./on-device.ts";
import type { PrivateIndex } from "./private-index.ts";

/**
 * In this tab's leader, marks `docId` open from the store's next local sequence, and removes the mark when it closes.
 * A mark of the same document found already there means the page ended without leaving: the own changes stored since
 * are told as already saved.
 */
export function markOpen(
  sync: PersonSync,
  open: { docId: string; messages: MessageQueue },
): () => void {
  const { docId } = open;
  const { memory, userId } = sync;
  let closed = false;
  void (async () => {
    if (!sync.link.get().leader) return;
    const before = memory.openMarker(userId);
    const entries = (await sync.store.load(docId))?.entries ?? [];
    if (closed) return;
    const changed = new Set(
      entries.flatMap((entry) =>
        before?.docId === docId &&
        entry.kind === "update" &&
        entry.own &&
        entry.localSeq >= before.fromLocalSeq
          ? entry.elements
          : [],
      ),
    );
    if (changed.size > 0)
      open.messages.push(
        messageFor({ kind: "crash_recovered", count: changed.size }),
      );
    const last = Math.max(0, ...entries.map((entry) => entry.localSeq));
    memory.setOpenMarker(userId, { docId, fromLocalSeq: last + 1 });
  })();
  return () => {
    closed = true;
    if (memory.openMarker(userId)?.docId === docId)
      memory.setOpenMarker(userId, null);
  };
}

/** In this tab's leader, removes the open marker: the page or the person's sync ends without a crash. */
export function unmarkOpen(sync: PersonSync): void {
  if (sync.link.get().leader) sync.memory.setOpenMarker(sync.userId, null);
}

/**
 * Asks the browser to keep this origin's data, once, at the person's first own change of the session. Firefox would
 * ask the person a question, so there only Preferences asks.
 */
export function askPersistenceOnce(where: Where): () => void {
  let asked = where.browser === "Firefox";
  return () => {
    if (asked) return;
    asked = true;
    void import("@manent/client-web")
      .then(({ requestPersistence }) =>
        requestPersistence("storage" in navigator ? navigator.storage : null),
      )
      .catch(() => {
        // a browser that cannot be asked keeps the data as it decides; Preferences says which
      });
  };
}

interface ClearedIndexes {
  privateIndex: PrivateIndex;
  checkCleared: typeof checkCleared;
  keepOnDevice: typeof keepOnDevice;
}

/**
 * Once the private index has synced, tells what came back to a browser that cleared Manent's data. Returns `indexes`,
 * whose `keepOnDevice` in such a browser writes this device's entries only after that check: the check then reads those
 * earlier sessions left, and a new browser, which left none, is told nothing. A browser that kept its store has nothing
 * to be told, and writes them at once, even while the index cannot sync.
 */
export function tellCleared<T extends ClearedIndexes>(
  sync: PersonSync,
  indexes: T,
  open: { deviceId: string; messages: MessageQueue },
): T {
  if (sync.hadDatabase !== false) return indexes;
  const checked = (async (): Promise<void> => {
    const { handle } = indexes.privateIndex;
    if (!handle.status.get().synced)
      await new Promise<void>((resolve) => {
        const stop = handle.status.subscribe((status) => {
          if (!status.synced) return;
          stop();
          resolve();
        });
      });
    const event = await indexes.checkCleared({
      hadDatabase: sync.hadDatabase,
      privateIndex: indexes.privateIndex,
      deviceId: open.deviceId,
      documents: () => sync.client.documents(),
    });
    if (event !== null) open.messages.push(messageFor(event));
  })().catch(() => {
    // the server's list could not be read, so nothing can be told; this device's entries are written as before
  });
  return {
    ...indexes,
    keepOnDevice: (keep) => {
      let stop: (() => void) | null = null;
      let stopped = false;
      void checked.then(() => {
        if (!stopped) stop = indexes.keepOnDevice(keep);
      });
      return () => {
        stopped = true;
        stop?.();
      };
    },
  };
}

/** Checks the demo's seed; when it differs from the remembered seed, runs `beforeClear`, clears this browser's data and reloads. */
export async function followSeed(
  options: Pick<CommandsOptions, "api" | "storage">,
  beforeClear?: () => Promise<void>,
): Promise<void> {
  const device = await import("./device-memory.ts");
  await followDemoSeed({
    demo: () => readDemoCached(options.api),
    memory: device.createDeviceMemory({
      local: options.storage,
      session: null,
    }),
    clear: async () => {
      await beforeClear?.();
      await (
        await import("@manent/client-web")
      ).clearManentData(device.browserStores());
    },
    reload: () => reloadAtHome(location),
  });
}

/** What the person's documents do as the page goes, over the started sync. */
export function leavePage(
  sync: PersonSync,
  maps: { prefs: LaterMap; keys: LaterMap },
  handles: readonly DocHandle[],
): void {
  const { memory, link, userId } = sync;
  memory.keepLegacyMaps(userId, {
    prefs: maps.prefs.held(),
    keys: maps.keys.held(),
  });
  unmarkOpen(sync);
  if (link.get().state === "online") return;
  for (const handle of handles)
    if (handle.status.get().waiting > 0)
      void handle.saveVersion("session_end").catch(() => {
        // best effort: the page is going, and the changes are already saved on the device
      });
}
