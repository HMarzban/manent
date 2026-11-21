// The editor's sessions over the person's sync client: a document's session is its handle, a scratch document until
// the handle's document holds a block, and, while the person may only read, a copy that follows the view.
import {
  ORIGIN_REMOTE,
  applyBlockOps,
  scriptDocFromJSON,
  yXmlFragmentForBinding,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { mergeByBlock } from "@manent/revisions";
import type { BlockJSON, DocJSON, FormatId } from "@manent/schema";
import type { DocHandle, SyncClient, ViewHandle } from "@manent/sync-client";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { LocalSession } from "./editor-sessions.ts";
import { firstBlock } from "./first-block.ts";

const noop = (): void => {};

// who may type is the document's status, so no session shows static content
const NEVER_READ_ONLY: Subscribable<DocJSON | null> = createValue(null);

/** `blocks` as one section. */
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

/**
 * Shows `handle`'s document once it holds a block, and `scratch` until then; the scratch is never written into the
 * document. The returned function stops waiting for the first block.
 */
function showOwn(
  handle: DocHandle,
  scratch: CrdtDoc,
  show: (doc: CrdtDoc) => void,
): () => void {
  const doc = handle.doc();
  const body = yXmlFragmentForBinding(doc);
  if (body.length > 0) {
    show(doc);
    return noop;
  }
  show(scratch);
  const stop = doc.subscribe(() => {
    if (body.length === 0) return;
    stop();
    show(doc);
  });
  return stop;
}

/** Shows `opened`'s document, or a copy of its view while it has one, and passes its awareness on; the returned function stops. */
function attachHandle(opened: DocHandle, shown: Showing): () => void {
  let stopShowing = noop;
  const own = (): void => {
    stopShowing();
    stopShowing = showOwn(opened, shown.scratch, shown.show);
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
 * Another writer's changes to `doc()`, held while the page holds remote changes, as the handle's own are; `attach`
 * passes the holds made before the handle opened on to it.
 */
function heldRemote(doc: () => CrdtDoc): {
  holdRemote(): void;
  releaseRemote(): void;
  receive(update: Uint8Array): void;
  attach(handle: DocHandle): void;
} {
  let handle: DocHandle | null = null;
  let holds = 0;
  let held: Uint8Array[] = [];
  return {
    holdRemote() {
      holds += 1;
      handle?.holdRemote();
    },
    releaseRemote() {
      holds -= 1;
      handle?.releaseRemote();
      if (holds > 0) return;
      const waiting = held;
      held = [];
      for (const update of waiting) doc().applyUpdate(update, ORIGIN_REMOTE);
    },
    receive(update) {
      if (holds > 0) held.push(update);
      else doc().applyUpdate(update, ORIGIN_REMOTE);
    },
    attach(opened) {
      handle = opened;
      for (let i = 0; i < holds; i++) opened.holdRemote();
    },
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
  const scratch = scriptDocFromJSON(docOf([firstBlock(format)]));
  let doc = scratch;
  const kept = createValue(false);
  const shown: Showing = {
    scratch,
    made: [scratch],
    show(next) {
      if (next === doc) return;
      doc = next;
      for (const listener of replaced) listener();
      // after the listeners: an editor bound when this turns true is not then told to bind again
      kept.set(next !== scratch);
    },
    hear(update) {
      for (const listener of awareness) listener(update);
    },
  };
  const remote = heldRemote(() => doc);
  let handle: DocHandle | null = null;
  let ended = false;
  let detach = noop;
  client
    .then(async (c) => {
      const opened = await c.open(docId);
      if (ended) return opened.close();
      handle = opened;
      remote.attach(opened);
      detach = attachHandle(opened, shown);
    })
    .catch(() => {
      // the document's status says this device is not saving it, so typing goes on in what the page shows
      kept.set(true);
    });
  return {
    docId,
    doc: () => doc,
    holdRemote: remote.holdRemote,
    releaseRemote: remote.releaseRemote,
    sendAwareness: (update) => handle?.sendAwareness(update),
    onAwareness: (listener) => listen(awareness, listener),
    onReplaced: (listener) => listen(replaced, listener),
    readOnly: NEVER_READ_ONLY,
    kept,
    receive: remote.receive,
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
