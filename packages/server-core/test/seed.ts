// Documents placed in storage, logs written by a typist, and the document a whole log replays to.
import { ORIGIN_LOAD, createDoc, scriptBody, updateMeta } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocJSON } from "@manent/schema";
import type { Home, Storage } from "@manent/storage";

export const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
export const DOC2 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce";
export const PROJECT = "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5";
export const HOME: Home = { kind: "project", id: PROJECT };
export const BLOCK = "b000000000000001";

/** Places a script in `home`'s file and gives `userId` the owner's role on it. */
export function placeScript(
  storage: Storage,
  options: { docId?: string; home?: Home; userId?: string } = {},
): void {
  const { docId = DOC, home = HOME, userId = "sam" } = options;
  storage.directory.place(docId, home, "script", userId);
  storage.open(home).log.create({
    id: docId,
    kind: "script",
    ownerUserId: null,
    schemaVersion: 1,
    engineVersion: 0,
  });
  storage.directory.setRole(docId, userId, "owner", ["delete"]);
}

/** One client's edits, each returned as the update it made. */
export interface Typist {
  readonly doc: CrdtDoc;
  /** Inserts an action block after `after` (null: at the start). */
  insertBlock(id: string, after: string | null, text?: string): Uint8Array;
  /** Appends `text` to the block. */
  type(id: string, text: string): Uint8Array;
  deleteText(id: string, offset: number, length: number): Uint8Array;
}

export function createTypist(clientId: number): Typist {
  const doc = createDoc({ clientId });
  const body = scriptBody(doc);
  const capture = (write: Parameters<typeof body.write>[0]): Uint8Array => {
    let made: Uint8Array | null = null;
    const stop = doc.subscribe((update) => {
      made = update;
    });
    body.write(write);
    stop();
    if (made === null) throw new RangeError("the write changed nothing");
    return made;
  };
  const textOf = (id: string): string =>
    body
      .materialize()
      .content?.flatMap((section) => section.content ?? [])
      .find((block) => block.attrs?.id === id)
      ?.content?.map((run) => run.text)
      .join("") ?? "";
  return {
    doc,
    insertBlock: (id, after, text = "") =>
      capture((w) =>
        w.insertBlocks(after, [
          {
            type: "block",
            attrs: { id, type: "action" },
            content: text === "" ? [] : [{ type: "text", text }],
          },
        ]),
      ),
    type: (id, text) =>
      capture((w) => w.insertText(id, textOf(id).length, text)),
    deleteText: (id, offset, length) =>
      capture((w) => w.deleteText(id, offset, length)),
  };
}

/** Per client id in the update, the clock after it, as the write path records it. */
export function clocksOf(
  update: Uint8Array,
): { clientId: number; clock: number }[] {
  return updateMeta(update).map(({ clientId, toClock }) => ({
    clientId,
    clock: toClock,
  }));
}

/** Appends each update to DOC's log in HOME as an edit by `userId`. */
export function appendAll(
  storage: Storage,
  updates: readonly Uint8Array[],
  options: { docId?: string; home?: Home; userId?: string } = {},
): void {
  const { docId = DOC, home = HOME, userId = "sam" } = options;
  const file = storage.open(home);
  file.transaction(() => {
    for (const update of updates)
      file.log.append({
        docId,
        generation: 1,
        update,
        userId,
        origin: "edit",
        clocks: clocksOf(update),
      });
  });
}

/**
 * A placed script whose log holds `n` real updates: the first inserts BLOCK, each later one types
 * a character into it. The typist goes on from there.
 */
export function seedLog(storage: Storage, n: number, clientId = 101): Typist {
  placeScript(storage);
  const typist = createTypist(clientId);
  const updates = [typist.insertBlock(BLOCK, null)];
  for (let i = 1; i < n; i++) updates.push(typist.type(BLOCK, String(i % 10)));
  appendAll(storage, updates);
  return typist;
}

/** `n` more characters typed into BLOCK, each appended as its own row. */
export function appendMore(storage: Storage, typist: Typist, n: number): void {
  const updates: Uint8Array[] = [];
  for (let i = 0; i < n; i++) updates.push(typist.type(BLOCK, "+"));
  appendAll(storage, updates);
}

/** The script every row of the log up to `seq` builds, read without quarantining anything. */
export function replayThrough(
  storage: Storage,
  seq: number,
  options: { docId?: string; home?: Home } = {},
): DocJSON {
  const { docId = DOC, home = HOME } = options;
  const doc = createDoc();
  for (const row of storage
    .open(home)
    .log.tail(docId, 1, 0, { quarantine: false }).rows)
    if (row.seq <= seq) doc.applyUpdate(row.update, ORIGIN_LOAD);
  return scriptBody(doc).materialize();
}

export function replayAll(
  storage: Storage,
  options: { docId?: string; home?: Home } = {},
): DocJSON {
  return replayThrough(storage, Number.MAX_SAFE_INTEGER, options);
}
