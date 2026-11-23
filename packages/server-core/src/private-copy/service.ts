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
import { OWNER_CAPABILITIES } from "../sync/access.ts";
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

/** What the service is given. */
interface Deps {
  storage: Storage;
  sync: () => SyncService;
  clock: Clock;
  /** A new document or version id: a canonical lower-case UUID. */
  ids(): string;
}

/** The room script's file, when the writer may edit it. */
function roomOf(
  { storage, sync }: Deps,
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
function listCopy(
  { sync }: Deps,
  copy: PrivateCopyRow,
  review: readonly [string, ReviewEntry][] = [],
): Promise<boolean> {
  return writePrivateIndex(sync(), copy.ownerUserId, {
    docId: copy.sourceDocId,
    entry: {
      privateDocId: copy.privateDocId,
      createdAt: copy.createdAt,
      handedInAt: copy.handedInAt,
    },
    review,
  });
}

/** The owner's role on the copy: `view` while it is handed in and once it is, so that no push lands unmerged; else the owner's. */
function holdCopy(
  { storage, sync }: Deps,
  copy: PrivateCopyRow,
  held: "view" | "owner",
): void {
  const { privateDocId, ownerUserId } = copy;
  const { directory } = storage;
  if (directory.roleOf(privateDocId, ownerUserId)?.role === held) return;
  const capabilities = held === "owner" ? OWNER_CAPABILITIES : [];
  directory.setRole(privateDocId, ownerUserId, held, capabilities);
  sync().accessChanged(privateDocId, ownerUserId);
}

async function makeCopy(
  deps: Deps,
  userId: string,
  docId: string,
  file: DocFile,
): Promise<PrivateCopyOutcome<PrivateCreateResponse>> {
  const { storage, sync, clock, ids } = deps;
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
  return (await listCopy(deps, row))
    ? { ok: true, value: { privateDocId } }
    : refused("busy");
}

/** The open copy, writable again and listed again in case a hand-in or a create was cut short; else a new one. */
async function openCopy(
  deps: Deps,
  userId: string,
  docId: string,
): Promise<PrivateCopyOutcome<PrivateCreateResponse>> {
  const room = roomOf(deps, userId, docId);
  if (!room.ok) return room;
  const { file } = room;
  const open = file.privateCopies.latestCopyOf(docId, userId);
  if (open === null || open.handedInAt !== null)
    return makeCopy(deps, userId, docId, file);
  holdCopy(deps, open, "owner");
  const { privateDocId } = open;
  return (await listCopy(deps, open))
    ? { ok: true, value: { privateDocId } }
    : refused("busy");
}

/**
 * After the hand-in's commit, and again for a retried key: the copy read-only for its owner, then its entry closed
 * and what the hand-in lists under To review in their private index.
 */
async function settle(
  deps: Deps,
  copy: PrivateCopyRow,
  hand: { at: number; answer: HandInResponse },
): Promise<void> {
  holdCopy(deps, copy, "view");
  const { privateDocId, sourceDocId } = copy;
  const handed = { docId: sourceDocId, privateDocId, at: hand.at };
  const review = reviewEntriesOf(handed, hand.answer);
  // when this does not commit, a retried key files again what is missing
  await listCopy(deps, { ...copy, handedInAt: hand.at }, review);
}

/** A retried key's stored answer, settled again in case the first settling was cut short. */
async function answerAgain(
  deps: Deps,
  request: { userId: string; docId: string; file: DocFile },
  stored: HandInRow,
): Promise<PrivateCopyOutcome<HandInResponse>> {
  const { userId, docId, file } = request;
  const copy = file.privateCopies.copyOf(stored.privateDocId);
  const answer = readStoredAnswer(stored.answer);
  if (stored.userId !== userId || copy?.sourceDocId !== docId)
    return refused("bad_request");
  if (answer === null) return refused("bad_request");
  await settle(deps, copy, { at: stored.at, answer });
  return { ok: true, value: answer };
}

/** The open copy, held read-only from before it is read until the hand-in commits, merged into the room; then settled and told. */
async function handInCopy(
  deps: Deps,
  userId: string,
  { docId, key }: HandInRequest,
  keep: HistoryService["keep"],
): Promise<PrivateCopyOutcome<HandInResponse>> {
  const { storage, sync, clock, ids } = deps;
  const room = roomOf(deps, userId, docId);
  if (!room.ok) return room;
  const { file } = room;
  const stored = file.privateCopies.handInOf(key);
  if (stored !== null)
    return answerAgain(deps, { userId, docId, file }, stored);
  const copy = file.privateCopies.latestCopyOf(docId, userId);
  if (copy === null || storage.directory.placeOf(copy.privateDocId) === null)
    return refused("no_private_copy");
  if (copy.handedInAt !== null) return refused("already_handed_in");
  const base = baseOf(copy);
  if (base === null) return refused("invalid");
  holdCopy(deps, copy, "view");
  const read = { docId: copy.privateDocId, userId };
  const mine = await readAtTurn(sync(), read, scriptContentOf);
  const versionId = ids();
  const at = clock.now();
  const hand =
    mine === null
      ? null
      : {
          file,
          userId,
          key,
          copy,
          base,
          mine: mine.value,
          versionId,
          at,
          keep,
        };
  const written =
    hand === null ? refused("busy") : await writeHandIn(sync(), hand);
  if (!written.ok) {
    holdCopy(deps, copy, "owner");
    return refused(written.code);
  }
  const { answer } = written;
  await settle(deps, copy, { at, answer });
  const { scenes } = answer;
  const control: HandedInControl = { userId, versionId, at, scenes };
  const data = new TextEncoder().encode(JSON.stringify(control));
  sync().broadcast(docId, "handed_in", data);
  return { ok: true, value: answer };
}

export function createPrivateCopyService(deps: Deps): PrivateCopyService {
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

  return {
    create: (userId, { docId }) =>
      inChain(docId, () => openCopy(deps, userId, docId)),
    handIn: (userId, request, keep) =>
      inChain(request.docId, () => handInCopy(deps, userId, request, keep)),
  };
}
