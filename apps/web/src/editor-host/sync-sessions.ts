// The editor's sessions over the person's sync client: a document's session is its handle, a scratch document until
// the handle opens, and, while the person may only read, a copy that follows the view.
import {
  ORIGIN_REMOTE,
  applyBlockOps,
  scriptBody,
  scriptDocFromJSON,
  yXmlFragmentForBinding,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { firstElement } from "@manent/editor";
import { mergeByBlock } from "@manent/revisions";
import { blockText, blocksOf, randomBlockId } from "@manent/schema";
import type { BlockJSON, DocJSON, FormatId } from "@manent/schema";
import type { DocHandle, SyncClient, ViewHandle } from "@manent/sync-client";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { LocalSession } from "./editor-sessions.ts";

const noop = (): void => {};

// who may type is the document's status, so no session shows static content
const NEVER_READ_ONLY: Subscribable<DocJSON | null> = createValue(null);

/** A new script of `format`: one block of its first element, in one section. */
function newScript(format: FormatId): CrdtDoc {
  const { type, kind } = firstElement(format);
  const block: BlockJSON = {
    type: "block",
    attrs: { id: randomBlockId(), type, kind },
  };
  return scriptDocFromJSON({
    type: "doc",
    content: [{ type: "section", content: [block] }],
  });
}

/** Deletes each block of `ids` that is still empty. */
function takeBack(doc: CrdtDoc, ids: ReadonlySet<string>): void {
  const untouched = blocksOf(scriptBody(doc).materialize()).flatMap((block) => {
    const { id } = block.attrs;
    return id !== null && ids.has(id) && blockText(block) === "" ? [id] : [];
  });
  scriptBody(doc).write((w) => {
    for (const id of untouched) w.deleteBlock(id);
  });
}

/**
 * The handle's document, given what `scratch` holds when it is empty here, so the page always has a block to type in.
 * When the server then answers with a script it already held, each of those blocks still empty is taken back, so a
 * script that exists elsewhere keeps no block of this device's. `stop` stops waiting for the answer.
 */
function ownDoc(
  handle: DocHandle,
  scratch: CrdtDoc,
): { doc: CrdtDoc; stop: () => void } {
  const doc = handle.doc();
  const body = yXmlFragmentForBinding(doc);
  if (body.length > 0) return { doc, stop: noop };
  const sections = scriptBody(scratch).materialize().content ?? [];
  const given = sections.flatMap((section) => section.content ?? []);
  scriptBody(doc).write((w) => w.insertBlocks(null, given));
  if (!handle.status.get().neverSynced) return { doc, stop: noop };
  // the sections this device wrote: one more after an update from the server is a script the server held
  let written = body.length;
  let held = false;
  const stopUpdates = doc.subscribe((_update, origin) => {
    if (origin !== ORIGIN_REMOTE) written = body.length;
    else if (body.length > written) held = true;
  });
  const stopStatus = handle.status.subscribe((status) => {
    if (status.neverSynced) return;
    stop();
    if (held) takeBack(doc, new Set(given.flatMap((b) => b.attrs?.id ?? [])));
  });
  const stop = (): void => {
    stopUpdates();
    stopStatus();
  };
  return { doc, stop };
}

/** The view's blocks as one section. */
const docOf = (blocks: readonly BlockJSON[]): DocJSON => ({
  type: "doc",
  content: [{ type: "section", content: [...blocks] }],
});

/**
 * Shows a copy of the view's blocks once its snapshot has come, then changes it block by block as they change, each
 * change applied as a remote one. The returned function stops following.
 */
function followView(
  view: ViewHandle,
  show: (copy: CrdtDoc) => void,
): () => void {
  let shown: readonly BlockJSON[] = [];
  let copy: CrdtDoc | null = null;
  const follow = (next: readonly BlockJSON[]): void => {
    if (copy !== null) {
      const [before, after] = [docOf(shown), docOf(next)];
      applyBlockOps(
        copy,
        mergeByBlock(before, after, before).ops,
        ORIGIN_REMOTE,
      );
    } else if (next.length > 0) {
      copy = scriptDocFromJSON(docOf(next));
      show(copy);
    }
    shown = next;
  };
  follow(view.blocks.get());
  return view.blocks.subscribe(follow);
}

/** What a session shows, and the awareness listeners it tells. */
interface Showing {
  readonly scratch: CrdtDoc;
  /** Every document made for this session, destroyed when it closes. */
  readonly made: CrdtDoc[];
  show(doc: CrdtDoc): void;
  hear(update: Uint8Array): void;
}

/** Shows `opened`'s document, or a copy of its view while it has one, and passes its awareness on; the returned function stops. */
function attachHandle(opened: DocHandle, shown: Showing): () => void {
  let stopShowing = noop;
  const own = (): void => {
    stopShowing();
    const { doc, stop } = ownDoc(opened, shown.scratch);
    stopShowing = stop;
    shown.show(doc);
  };
  const viewing = (view: ViewHandle | null): void => {
    if (view === null) return own();
    stopShowing();
    stopShowing = followView(view, (copy) => {
      shown.made.push(copy);
      shown.show(copy);
    });
  };
  const stops = [
    opened.onAwareness(shown.hear),
    opened.on((event) => {
      if (event.type === "replaced" && opened.readOnly.get() === null) own();
    }),
    opened.readOnly.subscribe(viewing),
  ];
  viewing(opened.readOnly.get());
  return () => {
    for (const stop of stops) stop();
    stopShowing();
  };
}

/** Adds `listener` to `listeners` until the returned function removes it. */
function listen<T>(listeners: Set<T>, listener: T): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * One document's session. `receive` and `receiveAwareness` reach the open document as another writer's change and
 * caret would, for the test build's simulated writer.
 */
function createSession(
  docId: string,
  format: FormatId,
  client: Promise<SyncClient>,
  closed: () => void,
): LocalSession {
  const replaced = new Set<() => void>();
  const awareness = new Set<(update: Uint8Array) => void>();
  const scratch = newScript(format);
  let doc = scratch;
  const shown: Showing = {
    scratch,
    made: [scratch],
    show(next) {
      doc = next;
      for (const listener of replaced) listener();
    },
    hear(update) {
      for (const listener of awareness) listener(update);
    },
  };
  let handle: DocHandle | null = null;
  let ended = false;
  let holds = 0;
  let detach = noop;
  client
    .then(async (c) => {
      const opened = await c.open(docId);
      if (ended) return opened.close();
      handle = opened;
      for (let i = 0; i < holds; i++) opened.holdRemote();
      detach = attachHandle(opened, shown);
    })
    .catch(() => {
      // the document's status says this device is not saving it; the page keeps what it shows
    });
  return {
    docId,
    doc: () => doc,
    holdRemote() {
      holds += 1;
      handle?.holdRemote();
    },
    releaseRemote() {
      holds -= 1;
      handle?.releaseRemote();
    },
    sendAwareness: (update) => handle?.sendAwareness(update),
    onAwareness: (listener) => listen(awareness, listener),
    onReplaced: (listener) => listen(replaced, listener),
    readOnly: NEVER_READ_ONLY,
    receive: (update) => doc.applyUpdate(update, ORIGIN_REMOTE),
    receiveAwareness: shown.hear,
    close() {
      ended = true;
      detach();
      replaced.clear();
      awareness.clear();
      if (handle !== null) void handle.close();
      for (const copy of shown.made) copy.destroy();
      closed();
    },
  };
}

/**
 * The same session for the same document while it is open, over `client.open`'s handle: the page and the editor share
 * it, and each closes its own. Its `readOnly` is always null: who may type is the document's status.
 */
export function createSyncSessions(options: { client: Promise<SyncClient> }): {
  open(docId: string, format: FormatId): LocalSession;
} {
  const open = new Map<string, LocalSession>();
  return {
    open(docId, format) {
      const known =
        open.get(docId) ??
        createSession(docId, format, options.client, () => open.delete(docId));
      open.set(docId, known);
      return known;
    },
  };
}
