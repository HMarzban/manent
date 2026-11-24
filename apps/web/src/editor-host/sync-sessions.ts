// The editor's sessions over the person's sync client: a document's session is its handle, a scratch document until
// the handle's document holds a block, and, while the person may only read, a copy that follows the view.
import {
  ORIGIN_REMOTE,
  applyBlockOps,
  scriptBody,
  scriptDocFromJSON,
  yXmlFragmentForBinding,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { mergeByBlock } from "@manent/revisions";
import type { BlockJSON, DocJSON, FormatId } from "@manent/schema";
import type { DocHandle, SyncClient, ViewHandle } from "@manent/sync-client";
import { createValue } from "@manent/ui";
import { writingActions } from "../state/writing.store.ts";
import type { TargetOutcome } from "../state/writing.store.ts";
import type { LocalSession } from "./editor-sessions.ts";
import { firstBlock } from "./first-block.ts";

const noop = (): void => {};

/** How long the page waits for a private copy to arrive, after which the move to it is given up. */
const PRIVATE_OPEN_WAIT_MS = 15_000;

type Schedule = (fn: () => void, delayMs: number) => () => void;

/** Gives up nothing: the room's own script is waited for as long as it takes. */
const NO_LIMIT = (): (() => void) => noop;

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

/** Calls `then` with `handle`'s document once it holds a block; the returned function stops waiting. */
function whenHeld(handle: DocHandle, then: (doc: CrdtDoc) => void): () => void {
  const doc = handle.doc();
  const body = yXmlFragmentForBinding(doc);
  if (body.length > 0) {
    then(doc);
    return noop;
  }
  const stop = doc.subscribe(() => {
    if (body.length === 0) return;
    stop();
    then(doc);
  });
  return stop;
}

/** Why `handle`'s open is given up before its document holds a block: the link is gone, or the server refused it. */
function givenUp(handle: DocHandle): "offline" | "refused" | null {
  const status = handle.status.get();
  if (status.link === "offline") return "offline";
  return status.side.length > 0 ? "refused" : null;
}

/**
 * Settles as `bound`, with the opened handle, once its document holds a block; or, first, as `givenUp` says, or as
 * `refused` when `opening` rejects or `limit` gives up. `wanted` is asked as it settles; a handle not bound is closed.
 * The returned function settles it as `moved`.
 */
function settleOpen(
  opening: Promise<DocHandle>,
  wanted: () => boolean,
  limit: (giveUp: () => void) => () => void,
  settled: (outcome: TargetOutcome, bound: DocHandle | null) => void,
): () => void {
  let done = false;
  let opened: DocHandle | null = null;
  const stops: (() => void)[] = [];
  const end = (outcome: TargetOutcome): void => {
    if (done) return;
    done = true;
    for (const stop of stops) stop();
    const final = outcome === "bound" && !wanted() ? "moved" : outcome;
    if (final !== "bound") void opened?.close();
    settled(final, final === "bound" ? opened : null);
  };
  stops.push(limit(() => end("refused")));
  opening.then(
    (handle) => {
      if (done) return void handle.close();
      opened = handle;
      const check = (): void => {
        const reason = givenUp(handle);
        if (reason !== null) end(reason);
      };
      stops.push(whenHeld(handle, () => end("bound")));
      if (!done) stops.push(handle.status.subscribe(check));
      check();
    },
    () => end("refused"),
  );
  return () => end("moved");
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
  let held = false;
  const stop = whenHeld(handle, (doc) => {
    held = true;
    show(doc);
  });
  if (!held) show(scratch);
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
  options: { client: Promise<SyncClient>; schedule: Schedule },
  closed: () => void,
): LocalSession {
  const { client, schedule } = options;
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
      // before the listeners: an editor told of it while the page takes no keys binds it read-only
      hold();
      for (const listener of replaced) listener();
      // after the listeners: an editor bound when this turns true is not then told to bind again
      kept.set(next !== scratch);
    },
    hear(update) {
      for (const listener of awareness) listener(update);
    },
  };
  const remote = heldRemote(() => doc);
  // not null while the person's typing goes to another document than the one shown, or a hand-in holds it: the
  // page shows what it holds read-only, so no keystroke reaches the document it leaves
  const readOnly = createValue<DocJSON | null>(null);
  const hold = (): void => {
    if (writingActions.isWritable(docId)) {
      stopWaiting();
      readOnly.set(null);
    } else if (readOnly.get() === null && doc !== scratch)
      readOnly.set(scriptBody(doc).materialize());
  };
  let handle: DocHandle | null = null;
  let ended = false;
  let detach = noop;
  let stopTarget = noop;
  let stopWaiting = noop;
  let stopKnown = noop;
  const stopHold = writingActions.subscribe(hold);
  // the handle before closes only once the next is shown: its close flushes its outbox, so nothing typed is lost
  const attach = (opened: DocHandle): void => {
    const previous = handle;
    const detachPrevious = detach;
    handle = opened;
    remote.attach(opened);
    detach = attachHandle(opened, shown);
    detachPrevious();
    if (previous !== null) void previous.close();
  };
  // a private copy that neither arrives nor is given up in time is given up, so the page is never held for good
  const limitOf = (target: string) =>
    target === docId
      ? NO_LIMIT
      : (giveUp: () => void) => schedule(giveUp, PRIVATE_OPEN_WAIT_MS);
  // another target is shown once it holds a block, so the page never falls back to the scratch
  const swapTo = (
    c: SyncClient,
    target: string,
    wanted: () => boolean,
  ): Promise<TargetOutcome> =>
    new Promise<TargetOutcome>((settled) => {
      stopWaiting();
      stopWaiting = settleOpen(
        c.open(target),
        wanted,
        limitOf(target),
        (outcome, opened) => {
          stopWaiting = noop;
          if (opened !== null) attach(opened);
          settled(outcome);
        },
      );
    });
  // the script itself opens first, and a private copy is moved to as any other target is, so one that never arrives
  // is given up in time
  const start = async (c: SyncClient): Promise<void> => {
    const opened = await c.open(docId);
    if (ended) return opened.close();
    // followed before the script is shown, so the page never takes keys in it while the copy opens
    stopTarget = writingActions.followTarget(docId, docId, (next, wanted) => {
      hold();
      return swapTo(c, next, wanted);
    });
    attach(opened);
  };
  const failed = (): void => {
    // the document's status says this device is not saving it, so typing goes on in what the page shows
    kept.set(true);
  };
  // until the person's private index says where their typing in it goes, the page shows the placeholder
  client
    .then((c) => {
      stopKnown = writingActions.whenKnown(c.link, () => {
        if (!ended) start(c).catch(failed);
      });
    })
    .catch(failed);
  return {
    docId,
    doc: () => doc,
    holdRemote: remote.holdRemote,
    releaseRemote: remote.releaseRemote,
    sendAwareness: (update) => handle?.sendAwareness(update),
    onAwareness: (listener) => listen(awareness, listener),
    onReplaced: (listener) => listen(replaced, listener),
    readOnly,
    kept,
    receive: remote.receive,
    receiveAwareness: shown.hear,
    close() {
      ended = true;
      stopKnown();
      stopHold();
      stopTarget();
      stopWaiting();
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
 * it, and each closes its own. Who may type is the document's status; its `readOnly` holds the page while the
 * person's typing moves to another document.
 */
export function createSyncSessions(options: {
  client: Promise<SyncClient>;
  schedule: Schedule;
}): {
  open(docId: string, format: FormatId): LocalSession;
} {
  const open = new Map<string, LocalSession>();
  return {
    open(docId, format) {
      const known =
        open.get(docId) ??
        createSession(docId, format, options, () => open.delete(docId));
      open.set(docId, known);
      return known;
    },
  };
}
