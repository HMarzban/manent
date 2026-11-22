// What lets the person trust this device with their work: the open marker that tells a crash, the browser asked to
// keep the data, a cleared browser told what came back, the demo's new seed followed before any store opens, and what
// is kept as the page goes.
import type { DocHandle } from "@manent/sync-client";
import { messageFor } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import { followDemoSeed } from "../../demo/use-demo.ts";
import type { Where } from "../../platform.ts";
import type { CommandsOptions } from "../person-commands.ts";
import type { PersonSync } from "./create-sync.ts";
import type { LaterMap } from "./later-index.ts";
import type { checkCleared } from "./on-device.ts";
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

/** Once the private index has synced, tells what came back to a browser that cleared Manent's data. */
export function tellCleared(
  sync: PersonSync,
  indexes: { privateIndex: PrivateIndex; checkCleared: typeof checkCleared },
  open: { deviceId: string; messages: MessageQueue },
): void {
  const { handle } = indexes.privateIndex;
  const check = async (): Promise<void> => {
    const event = await indexes.checkCleared({
      hadDatabase: sync.hadDatabase,
      privateIndex: indexes.privateIndex,
      deviceId: open.deviceId,
      documents: () => sync.client.documents(),
    });
    if (event !== null) open.messages.push(messageFor(event));
  };
  if (handle.status.get().synced) return void check();
  const stop = handle.status.subscribe((status) => {
    if (!status.synced) return;
    stop();
    void check();
  });
}

/** Settles once the demo's seed has been followed: never when this device's data is cleared and the page reloaded. */
export async function followSeed(
  options: Pick<CommandsOptions, "api" | "storage">,
): Promise<void> {
  const device = await import("./device-memory.ts");
  await followDemoSeed({
    demo: () => options.api.demo(),
    memory: device.createDeviceMemory({
      local: options.storage,
      session: null,
    }),
    clear: async () =>
      (await import("@manent/client-web")).clearManentData(
        device.browserStores(),
      ),
    reload: () => location.reload(),
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
  // only the leader marks what it opens
  if (link.get().leader) memory.setOpenMarker(userId, null);
  if (link.get().state === "online") return;
  for (const handle of handles)
    if (handle.status.get().waiting > 0)
      void handle.saveVersion("session_end").catch(() => {
        // best effort: the page is going, and the changes are already saved on the device
      });
}
