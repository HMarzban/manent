// The private-copy service, which the server's configuration carries to its routes: a writer's private copy of a
// script made on this server, and handed in to the room.
import type { DocJSON } from "@manent/schema";
import type {
  DocFile,
  HandInRow,
  PrivateCopyRow,
  Storage,
} from "@manent/storage";
import type {
  HandInRequest,
  HandInResponse,
  HandedInControl,
  HttpErrorCode,
  PrivateCreateRequest,
  PrivateCreateResponse,
} from "@manent/sync-protocol";
import type { HistoryService } from "../history/service.ts";
import type { Clock, SyncService } from "../sync/ports.ts";
import { writeHandIn } from "./hand-in.ts";
import { reviewEntriesOf, writePrivateIndex } from "./private-index.ts";
import type { ReviewEntry } from "./private-index.ts";
import {
  fillCopy,
  readAtTurn,
  roomContentOf,
  scriptContentOf,
} from "./script-content.ts";
import { readStoredAnswer } from "./stored-answer.ts";

/** What a private-copy request is refused with, each one of `HTTP_ERROR_CODES`. */
export type PrivateCopyRefusal = Extract<
  HttpErrorCode,
  | "bad_request"
  | "unsupported_kind"
  | "forbidden"
  | "deleted"
  | "busy"
  | "invalid"
  | "no_private_copy"
  | "already_handed_in"
>;

export type PrivateCopyOutcome<T> =
  { ok: true; value: T } | { ok: false; code: PrivateCopyRefusal };

export interface PrivateCopyService {
  /**
   * The writer's open private copy of the room's script, made when they have none: kind `private`, owned by them,
   * holding the room's body, settings and material, its base recorded, and entered in their private index only.
   */
  create(
    userId: string,
    request: PrivateCreateRequest,
  ): Promise<PrivateCopyOutcome<PrivateCreateResponse>>;
  /**
   * Hands the writer's open copy in to the room, keeping "Before hand-in" with `keep`; the copy is then closed and
   * read-only, its overlaps and set-aside text are in their private index, and the room hears `handed_in`. A key
   * this writer used answers the same again; another writer's is `bad_request`.
   */
  handIn(
    userId: string,
    request: HandInRequest,
    keep: HistoryService["keep"],
  ): Promise<PrivateCopyOutcome<HandInResponse>>;
}

const refused = (code: PrivateCopyRefusal) => ({ ok: false, code }) as const;

const isDocJson = (value: unknown): value is DocJSON =>
  typeof value === "object" &&
  value !== null &&
  Reflect.get(value, "type") === "doc";

/** The copy's recorded base; null when what is stored does not read as a document. */
function baseOf(copy: PrivateCopyRow): DocJSON | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(copy.baseJson);
  } catch {
    // a base that is not JSON is damage: the hand-in is refused rather than merged against nothing
    return null;
  }
  return isDocJson(parsed) ? parsed : null;
}

export function createPrivateCopyService(options: {
  storage: Storage;
  sync: () => SyncService;
  clock: Clock;
  /** A new document or version id: a canonical lower-case UUID. */
  ids(): string;
}): PrivateCopyService {
  const { storage, sync, clock, ids } = options;
  /** By room script: the tail of its requests, which run one at a time. */
  const chains = new Map<string, Promise<void>>();

  function inChain<T>(docId: string, run: () => Promise<T>): Promise<T> {
    const before = chains.get(docId);
    const next = before === undefined ? run() : before.then(run);
    const tail = next.then(
      () => {},
      () => {},
    );
    chains.set(docId, tail);
    void tail.then(() => {
      if (chains.get(docId) === tail) chains.delete(docId);
    });
    return next;
  }

  /** The room script's file, when the writer may edit it. */
  function roomOf(
    userId: string,
    docId: string,
  ): { ok: true; file: DocFile } | { ok: false; code: PrivateCopyRefusal } {
    const resolved = sync().access.resolve(userId, docId);
    if (!resolved.ok) return refused(resolved.code);
    const { access, kind, home } = resolved;
    if (kind !== "script") return refused("unsupported_kind");
    if (access.role !== "owner" && access.role !== "edit")
      return refused("forbidden");
    return { ok: true, file: storage.open(home) };
  }

  /** The copy's entry in its owner's private index, as its row has it, and `review` added there. */
  const listCopy = (
    copy: PrivateCopyRow,
    review: readonly [string, ReviewEntry][] = [],
  ): Promise<boolean> =>
    writePrivateIndex(sync(), copy.ownerUserId, {
      docId: copy.sourceDocId,
      entry: {
        privateDocId: copy.privateDocId,
        createdAt: copy.createdAt,
        handedInAt: copy.handedInAt,
      },
      review,
    });

  async function makeCopy(
    userId: string,
    docId: string,
    file: DocFile,
  ): Promise<PrivateCopyOutcome<PrivateCreateResponse>> {
    const room = await readAtTurn(sync(), { docId, userId }, roomContentOf);
    if (room === null) return refused("busy");
    const privateDocId = ids();
    const made = sync().access.create(userId, {
      docId: privateDocId,
      kind: "private",
      home: "user",
    });
    if (!made.ok) return refused("forbidden");
    const createdAt = clock.now();
    const copy = { privateDocId, userId, now: createdAt };
    if (!(await fillCopy(sync(), copy, room.value))) {
      // an empty copy behind an open row would hand in as the deletion of every block
      storage.directory.tombstone(privateDocId, userId);
      return refused("busy");
    }
    const row: PrivateCopyRow = {
      privateDocId,
      sourceDocId: docId,
      ownerUserId: userId,
      baseGeneration: room.head.generation,
      baseSeq: room.head.seq,
      baseJson: JSON.stringify(room.value.body),
      createdAt,
      handedInAt: null,
    };
    file.privateCopies.addCopy(row);
    return (await listCopy(row))
      ? { ok: true, value: { privateDocId } }
      : refused("busy");
  }

  /**
   * After the hand-in's commit, and again for a retried key: the copy read-only for its owner, then its entry closed
   * and what the hand-in lists under To review in their private index.
   */
  async function settle(
    copy: PrivateCopyRow,
    hand: { at: number; answer: HandInResponse },
  ): Promise<void> {
    const { privateDocId, ownerUserId, sourceDocId } = copy;
    const { directory } = storage;
    if (directory.roleOf(privateDocId, ownerUserId)?.role !== "view") {
      directory.setRole(privateDocId, ownerUserId, "view", []);
      sync().accessChanged(privateDocId, ownerUserId);
    }
    const handed = { docId: sourceDocId, privateDocId, at: hand.at };
    const review = reviewEntriesOf(handed, hand.answer);
    // when this does not commit, a retried key files again what is missing
    await listCopy({ ...copy, handedInAt: hand.at }, review);
  }

  /** A retried key's stored answer, settled again in case the first settling was cut short. */
  async function answerAgain(
    userId: string,
    docId: string,
    file: DocFile,
    stored: HandInRow,
  ): Promise<PrivateCopyOutcome<HandInResponse>> {
    const copy = file.privateCopies.copyOf(stored.privateDocId);
    const answer = readStoredAnswer(stored.answer);
    if (stored.userId !== userId || copy?.sourceDocId !== docId)
      return refused("bad_request");
    if (answer === null) return refused("bad_request");
    await settle(copy, { at: stored.at, answer });
    return { ok: true, value: answer };
  }

  async function handInCopy(
    userId: string,
    { docId, key }: HandInRequest,
    keep: HistoryService["keep"],
  ): Promise<PrivateCopyOutcome<HandInResponse>> {
    const room = roomOf(userId, docId);
    if (!room.ok) return room;
    const { file } = room;
    const stored = file.privateCopies.handInOf(key);
    if (stored !== null) return answerAgain(userId, docId, file, stored);
    const copy = file.privateCopies.latestCopyOf(docId, userId);
    if (copy === null || storage.directory.placeOf(copy.privateDocId) === null)
      return refused("no_private_copy");
    if (copy.handedInAt !== null) return refused("already_handed_in");
    const base = baseOf(copy);
    if (base === null) return refused("invalid");
    const read = { docId: copy.privateDocId, userId };
    const mine = await readAtTurn(sync(), read, scriptContentOf);
    if (mine === null) return refused("busy");
    const versionId = ids();
    const at = clock.now();
    const written = await writeHandIn(sync(), {
      file,
      userId,
      key,
      copy,
      base,
      mine: mine.value,
      versionId,
      at,
      keep,
    });
    if (!written.ok) return refused(written.code);
    const { answer } = written;
    await settle(copy, { at, answer });
    const { scenes } = answer;
    const control: HandedInControl = { userId, versionId, at, scenes };
    const data = new TextEncoder().encode(JSON.stringify(control));
    sync().broadcast(docId, "handed_in", data);
    return { ok: true, value: answer };
  }

  return {
    create: (userId, { docId }) =>
      inChain(docId, async () => {
        const room = roomOf(userId, docId);
        if (!room.ok) return room;
        const { file } = room;
        const open = file.privateCopies.latestCopyOf(docId, userId);
        if (open === null || open.handedInAt !== null)
          return makeCopy(userId, docId, file);
        const { privateDocId } = open;
        return (await listCopy(open))
          ? { ok: true, value: { privateDocId } }
          : refused("busy");
      }),
    handIn: (userId, request, keep) =>
      inChain(request.docId, () => handInCopy(userId, request, keep)),
  };
}
