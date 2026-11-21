// The history of every script this server serves: versions made when a session ends, marked,
// named or uploaded, listed a page at a time, opened, and kept in shape.
import type { AuthorityValues } from "@manent/revisions";
import { rejects, validateBlocks } from "@manent/schema";
import type {
  DocFile,
  Storage,
  VersionCursor,
  VersionRow,
} from "@manent/storage";
import { isReplayKey } from "@manent/sync-protocol";
import type {
  HistoryControl,
  HttpErrorCode,
  LockAnchorRecord,
  NameRequest,
  SaveRequest,
  UploadRequest,
  VersionContent,
  VersionContentResponse,
  VersionItem,
  VersionListResponse,
  VersionPosition,
  VersionResponse,
} from "@manent/sync-protocol";
import type { Clock, SyncHooks, SyncService } from "../sync/ports.ts";
import { contentAt, openVersion, uploadedContent } from "./content.ts";
import type { LocksAt } from "./content.ts";
import { createMaintenance } from "./maintenance.ts";
import { createSessions } from "./sessions.ts";
import type { Recorded, Recorder } from "./summaries.ts";
import {
  createRecorder,
  itemOf,
  positionOf,
  readStoredResponse,
} from "./summaries.ts";

/** A person's session on a document ends after this without a push of theirs. */
const SESSION_IDLE_MS = 600_000;
/** The longest draft name, in characters, once trimmed. */
const NAME_MAX_CHARS = 120;
/** An uploaded version's id: what a list cursor can carry. */
const VERSION_ID = /^[A-Za-z0-9_-]{1,64}$/;

export type HistoryOutcome<T> =
  { ok: true; value: T } | { ok: false; code: HttpErrorCode };

/** What another feature knows about a version: the locks open at a position, and what a block that comes back takes. */
export interface HistoryExtras {
  /** The open lock table at that position; null: not locked. */
  locksAt(
    file: DocFile,
    docId: string,
    at: VersionPosition,
  ): LockAnchorRecord[] | null;
  /** What a block that comes back takes. */
  authority(file: DocFile, docId: string): AuthorityValues;
}

export interface HistoryService extends SyncHooks {
  list(
    userId: string,
    docId: string,
    cursor: VersionCursor | null,
    limit: number,
  ): Promise<HistoryOutcome<VersionListResponse>>;
  content(
    userId: string,
    docId: string,
    at: { versionId: string } | { position: VersionPosition },
  ): Promise<HistoryOutcome<VersionContentResponse>>;
  name(
    userId: string,
    body: NameRequest,
  ): Promise<HistoryOutcome<VersionResponse>>;
  save(
    userId: string,
    body: SaveRequest,
  ): Promise<HistoryOutcome<VersionResponse>>;
  upload(
    userId: string,
    body: UploadRequest,
  ): Promise<HistoryOutcome<VersionResponse>>;
  /** Inside the caller's transaction: the row, its snapshot and its summary. `content` absent: the document at its head now. */
  keep(file: DocFile, version: VersionRow, content?: VersionContent): void;
  /** Thins, fixes, purges and sweeps the document's history now. */
  maintain(docId: string): void;
}

const failed = (code: HttpErrorCode): { ok: false; code: HttpErrorCode } => ({
  ok: false,
  code,
});

export function createHistoryService(options: {
  sync: () => SyncService;
  storage: Storage;
  clock: Clock;
  ids(): string;
  extras?: HistoryExtras;
}): HistoryService {
  const { storage, clock, ids, extras } = options;
  /** By document: the tail of its requests, which run one at a time. */
  const chains = new Map<string, Promise<void>>();
  const locksAt: LocksAt = (file, docId, at) =>
    extras?.locksAt(file, docId, at) ?? null;
  const recorder = createRecorder({ ...options, locksAt });
  const maintenance = createMaintenance({ storage, clock, locksAt });

  /** Runs `run` after the document's earlier requests; at once when none is waiting. */
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

  /** The placed document's file, if `userId` may read it, or edit it as well. */
  function authorize(
    userId: string,
    docId: string,
    need: "read" | "edit",
  ): { ok: true; file: DocFile } | { ok: false; code: HttpErrorCode } {
    const { directory } = storage;
    if (directory.tombstoneOf(docId) !== null) return failed("deleted");
    const place = directory.placeOf(docId);
    if (place === null) return failed("not_found");
    const resolved = options.sync().access.resolve(userId, docId);
    if (!resolved.ok) return failed(resolved.code);
    const { role } = resolved.access;
    if (need === "edit" && role !== "owner" && role !== "edit")
      return failed("forbidden");
    return { ok: true, file: storage.open(place.home) };
  }

  /** A version made: CONTROL to every editor and viewer of the room, then maintenance if due. */
  function announce(
    docId: string,
    kind: HistoryControl["kind"],
    item: VersionItem,
  ): void {
    const control: HistoryControl = {
      kind,
      versionId: item.id,
      userId: item.createdByUserId,
      at: item.createdAt,
      name: item.name,
      versionAt: item.createdAt,
      scene: null,
      beforeVersionId: null,
    };
    const data = new TextEncoder().encode(JSON.stringify(control));
    options.sync().broadcast(docId, kind, data);
    maintenance.soon(docId);
  }

  /** A request answered once: its stored answer, else what `make` makes, told to the room. */
  function requested(
    file: DocFile,
    userId: string,
    request: { docId: string; key: string; tells: HistoryControl["kind"] },
    make: () => Promise<Recorded> | Recorded,
  ): Promise<HistoryOutcome<VersionResponse>> {
    const { docId, key } = request;
    return inChain(docId, async () => {
      const stored = file.history.request(docId, key);
      if (stored !== null) {
        const answer =
          stored.userId === userId ? readStoredResponse(stored.result) : null;
        return answer === null
          ? failed("bad_request")
          : { ok: true, value: answer };
      }
      const made = await make();
      if (!made.ok) return made;
      if (made.item === null)
        throw new RangeError("a requested version is always made");
      announce(docId, request.tells, made.item);
      return { ok: true, value: { version: made.item } };
    });
  }

  /** A listed version's content kept again under a name, at its position. */
  function nameListed(
    file: DocFile,
    source: VersionRow | null,
    made: { docId: string; userId: string; name: string; key: string },
  ): Recorded {
    const base =
      source?.docId === made.docId ? openVersion(file, source, locksAt) : null;
    if (source === null || base === null) return failed("not_found");
    const version: VersionRow = {
      ...source,
      id: ids(),
      kind: "named",
      name: made.name,
      createdByUserId: made.userId,
      createdAt: clock.now(),
      deviceId: null,
    };
    const how = { carry: false, snapshot: true, key: made.key };
    return recorder.recordAlone(file, version, base, how);
  }

  /** A device's version kept as a snapshot, its time the server's. */
  function uploaded(
    file: DocFile,
    userId: string,
    { docId, version }: UploadRequest,
  ): ReturnType<Recorder["recordAlone"]> {
    const base = uploadedContent(file, docId, version, locksAt);
    if (base === null) return failed("not_found");
    const { id, kind, name, deviceId } = version;
    const createdAt = clock.now();
    const at = { generation: null, seq: null };
    const stored = { id, docId, ...at, kind, name, deviceId, createdAt };
    const row = { ...stored, createdByUserId: userId };
    const how = { carry: true, snapshot: true, key: null, authorIds: [userId] };
    return recorder.recordAlone(file, row, base, how);
  }

  const sessions = createSessions({
    clock,
    idleMs: SESSION_IDLE_MS,
    ended(room, userId) {
      const { docId, file } = room;
      const made = {
        docId,
        kind: "auto",
        name: null,
        createdByUserId: userId,
      } as const;
      const how = {
        carry: true,
        snapshot: false,
        key: null,
        onlyWhenNew: true,
      };
      inChain(docId, () => recorder.atHead(file, made, how))
        .then((outcome) => {
          if (!outcome.ok || outcome.item === null) return;
          announce(docId, "version_created", outcome.item);
        })
        .catch(() => {
          // a session's version is made when it can be: a document deleted meanwhile keeps none,
          // and its log still holds every change the session made
        });
    },
  });

  return {
    committed: sessions.committed,
    editorLeft: sessions.editorLeft,
    forgotten(room) {
      recorder.forget(room.docId);
      maintenance.soon(room.docId);
    },
    async list(userId, docId, cursor, limit) {
      const access = authorize(userId, docId, "read");
      if (!access.ok) return access;
      const { file } = access;
      const row = file.log.get(docId);
      if (row === null) return failed("not_found");
      const rows = file.history.page(docId, cursor, limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const more = rows.length > limit && last !== undefined;
      return {
        ok: true,
        value: {
          versions: page.map((version) => itemOf(file, version)),
          next: more ? `${last.createdAt}:${last.id}` : null,
          head: { generation: row.generation, seq: row.headSeq },
          othersCanOpen: storage.directory.hasRoleBesides(docId, userId),
        },
      };
    },
    async content(userId, docId, at) {
      const access = authorize(userId, docId, "read");
      if (!access.ok) return access;
      const { file } = access;
      if ("versionId" in at) {
        const row = file.history.get(at.versionId);
        const found =
          row?.docId === docId ? openVersion(file, row, locksAt) : null;
        if (row === null || found === null) return failed("not_found");
        return {
          ok: true,
          value: { content: found, position: positionOf(row) },
        };
      }
      const found = contentAt(file, docId, at.position);
      if (found === null) return failed("not_found");
      const content = { ...found, locks: locksAt(file, docId, at.position) };
      return { ok: true, value: { content, position: at.position } };
    },
    async name(userId, body) {
      const { docId, key, fromVersionId } = body;
      const access = authorize(userId, docId, "edit");
      if (!access.ok) return access;
      const name = body.name.trim();
      if (!isReplayKey(key) || name === "" || [...name].length > NAME_MAX_CHARS)
        return failed("bad_request");
      const { file } = access;
      const request = { docId, key, tells: "draft_named" } as const;
      const made = {
        docId,
        kind: "named",
        name,
        createdByUserId: userId,
      } as const;
      const how = { carry: true, snapshot: true, key, onlyWhenNew: false };
      return requested(file, userId, request, () =>
        fromVersionId === null
          ? recorder.atHead(file, made, how)
          : nameListed(file, file.history.get(fromVersionId), {
              docId,
              userId,
              name,
              key,
            }),
      );
    },
    async save(userId, body) {
      const { docId, key, kind } = body;
      const access = authorize(userId, docId, "edit");
      if (!access.ok) return access;
      if (!isReplayKey(key)) return failed("bad_request");
      const { file } = access;
      const request = { docId, key, tells: "version_created" } as const;
      const made = { docId, kind, name: null, createdByUserId: userId };
      const how = { carry: true, snapshot: false, key, onlyWhenNew: false };
      return requested(file, userId, request, () =>
        recorder.atHead(file, made, how),
      );
    },
    async upload(userId, body) {
      const { docId, version } = body;
      const access = authorize(userId, docId, "edit");
      if (!access.ok) return access;
      if (!VERSION_ID.test(version.id)) return failed("bad_request");
      const { file } = access;
      return inChain(docId, async () => {
        const existing = file.history.get(version.id);
        if (existing !== null)
          return existing.docId === docId
            ? { ok: true, value: { version: itemOf(file, existing) } }
            : failed("bad_request");
        const blocks = (version.content.content ?? []).flatMap(
          (section) => section.content ?? [],
        );
        if (rejects(validateBlocks(blocks, { isIdTaken: () => false })))
          return failed("invalid");
        const made = uploaded(file, userId, body);
        return made.ok ? { ok: true, value: { version: made.item } } : made;
      });
    },
    keep(file, version, content) {
      const { docId } = version;
      const row = file.log.get(docId);
      if (row === null) throw new RangeError(`no document ${docId} here`);
      const head = { generation: row.generation, seq: row.headSeq };
      const base = content ?? contentAt(file, docId, head);
      if (base === null) throw new RangeError(`no head of ${docId} to keep`);
      const locks =
        extras === undefined ? base.locks : locksAt(file, docId, head);
      const how = { carry: content === undefined, snapshot: true, key: null };
      const previous = recorder.previousOf(file, docId);
      recorder.forget(docId);
      recorder.record(file, version, { ...base, locks }, how, previous);
    },
    maintain: maintenance.now,
  };
}
