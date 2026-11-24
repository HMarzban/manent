// Each open of a document its own handle over the client's one, closed once every open of it is closed.
import type {
  DocHandle,
  LinkFacts,
  Subscribable,
  SyncClient,
} from "@manent/sync-client";
import type { ControlKind } from "@manent/sync-protocol";
import { both } from "./sync-hooks.ts";
import type { Overlay } from "./sync-hooks.ts";

export type ControlListener = (
  docId: string,
  kind: ControlKind,
  data: Uint8Array,
) => void;

/** One open of a document: the client's handle, with its own `close`. */
function handleView(
  handle: DocHandle,
  overlay: Overlay,
  close: () => Promise<void>,
): DocHandle {
  return {
    docId: handle.docId,
    doc: () => handle.doc(),
    status: overlay.status(handle.docId, handle.status),
    recovered: handle.recovered,
    settings: handle.settings,
    writeSchema: handle.writeSchema,
    readOnly: handle.readOnly,
    upstream: handle.upstream,
    viewers: handle.viewers,
    on: (listener) =>
      both(handle.on(listener), overlay.on(handle.docId, listener)),
    setSetting: (key, value) => handle.setSetting(key, value),
    holdRemote: () => handle.holdRemote(),
    releaseRemote: () => handle.releaseRemote(),
    sendAwareness: (update) => handle.sendAwareness(update),
    onAwareness: (listener) => handle.onAwareness(listener),
    saveVersion: (label) => handle.saveVersion(label),
    nameVersion: (name) => handle.nameVersion(name),
    restoreLocally: (target, scope) => handle.restoreLocally(target, scope),
    deviceVersions: () => handle.deviceVersions(),
    lastServerSeq: () => handle.lastServerSeq(),
    adoptClientIds: (ids) => handle.adoptClientIds(ids),
    reserveClientId: () => handle.reserveClientId(),
    close,
  };
}

/**
 * The client, with each open of a document its own handle: the client's handle closes once every one of them is
 * closed, so the page, the editor and the drain each close only their own. While it is open, its CONTROL frames go
 * to `controls`.
 */
export function shareHandles(
  client: SyncClient,
  overlay: Overlay,
  link: Subscribable<LinkFacts>,
  controls: ReadonlySet<ControlListener>,
): SyncClient {
  const held = new Map<
    string,
    { opens: number; handle: Promise<DocHandle>; stop: (() => void) | null }
  >();
  const closing = new Map<string, Promise<void>>();
  const hold = async (
    docId: string,
    open: () => Promise<DocHandle>,
  ): Promise<DocHandle> => {
    await closing.get(docId);
    const entry = held.get(docId) ?? { opens: 0, handle: open(), stop: null };
    held.set(docId, entry);
    entry.opens += 1;
    // an open that failed is asked of the client again next time
    const forget = () => held.get(docId) === entry && held.delete(docId);
    void entry.handle.catch(forget);
    const handle = await entry.handle;
    entry.stop ??= handle.on((event) => {
      if (event.type !== "control") return;
      for (const listener of controls) listener(docId, event.kind, event.data);
    });
    let closed = false;
    return handleView(handle, overlay, async () => {
      if (closed) return;
      closed = true;
      entry.opens -= 1;
      if (entry.opens > 0 || held.get(docId) !== entry) return;
      held.delete(docId);
      entry.stop?.();
      const done = handle.close();
      closing.set(docId, done);
      await done;
      if (closing.get(docId) === done) closing.delete(docId);
    });
  };
  return {
    link,
    open: (docId, options) => hold(docId, () => client.open(docId, options)),
    async create(request) {
      const handle = await client.create(request);
      return hold(handle.docId, async () => handle);
    },
    documents: () => client.documents(),
    setOnline: (wanted) => client.setOnline(wanted),
    retryNow: () => client.retryNow(),
    view: (docId) => client.view(docId),
    prompter: (rundownId) => client.prompter(rundownId),
    privateCopy: (docId) => client.privateCopy(docId),
    driver: (docId) => client.driver(docId),
    close: () => client.close(),
  };
}
