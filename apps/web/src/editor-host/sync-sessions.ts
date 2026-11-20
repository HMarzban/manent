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
import { randomBlockId } from "@manent/schema";
import type { BlockJSON, DocJSON, FormatId } from "@manent/schema";
import type { DocHandle, SyncClient, ViewHandle } from "@manent/sync-client";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { LocalSession } from "./editor-sessions.ts";

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

/** The handle's document holding a script: one that is empty on this device starts from what `scratch` holds, as a new script does. */
function ownDoc(handle: DocHandle, scratch: CrdtDoc): CrdtDoc {
  const doc = handle.doc();
  if (yXmlFragmentForBinding(doc).length > 0) return doc;
  const sections = scriptBody(scratch).materialize().content ?? [];
  const blocks = sections.flatMap((section) => section.content ?? []);
  scriptBody(doc).write((w) => w.insertBlocks(null, blocks));
  return doc;
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
  const scratch = newScript(format);
  const made = [scratch];
  let doc = scratch;
  let handle: DocHandle | null = null;
  let ended = false;
  let holds = 0;
  let stopViewing: (() => void) | null = null;
  const replaced = new Set<() => void>();
  const awareness = new Set<(update: Uint8Array) => void>();
  const stops: (() => void)[] = [];
  const show = (next: CrdtDoc): void => {
    doc = next;
    for (const listener of replaced) listener();
  };
  const showOwn = (opened: DocHandle): void => show(ownDoc(opened, scratch));
  const viewing = (opened: DocHandle, view: ViewHandle | null): void => {
    stopViewing?.();
    stopViewing =
      view === null
        ? null
        : followView(view, (copy) => {
            made.push(copy);
            show(copy);
          });
    if (stopViewing === null) showOwn(opened);
  };
  const attach = (opened: DocHandle): void => {
    handle = opened;
    for (let i = 0; i < holds; i++) opened.holdRemote();
    stops.push(
      opened.onAwareness((update) => {
        for (const listener of awareness) listener(update);
      }),
      opened.on((event) => {
        if (event.type === "replaced" && stopViewing === null) showOwn(opened);
      }),
      opened.readOnly.subscribe((view) => viewing(opened, view)),
    );
    viewing(opened, opened.readOnly.get());
  };
  void client
    .then((c) => c.open(docId))
    .then((opened) => {
      if (ended) void opened.close();
      else attach(opened);
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
    onAwareness(listener) {
      awareness.add(listener);
      return () => {
        awareness.delete(listener);
      };
    },
    onReplaced(listener) {
      replaced.add(listener);
      return () => {
        replaced.delete(listener);
      };
    },
    readOnly: NEVER_READ_ONLY,
    receive: (update) => doc.applyUpdate(update, ORIGIN_REMOTE),
    receiveAwareness(update) {
      for (const listener of awareness) listener(update);
    },
    close() {
      ended = true;
      for (const stop of stops.splice(0)) stop();
      stopViewing?.();
      replaced.clear();
      awareness.clear();
      if (handle !== null) void handle.close();
      for (const copy of made) copy.destroy();
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
