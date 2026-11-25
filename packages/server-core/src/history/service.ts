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
  RestoreRequest,
  RestoreResponse,
  SaveRequest,
  UploadRequest,
  VersionContent,
  VersionContentResponse,
  VersionListResponse,
  VersionPosition,
  VersionResponse,
} from "@manent/sync-protocol";
import type { Clock, SyncHooks, SyncService } from "../sync/ports.ts";
import { createAttribution } from "./attribution.ts";
import type { Attribution } from "./attribution.ts";
import { contentAt, openVersion, uploadedContent } from "./content.ts";
import type { LocksAt } from "./content.ts";
import type { DraftEvents } from "./draft-events.ts";
import { createMaintenance } from "./maintenance.ts";
import { createKeep } from "./keep.ts";
import { createNamedVersions } from "./named-version.ts";
import { controlOf, createHistoryRequests, failed } from "./requests.ts";
import { createRestorer } from "./restore.ts";
import { createSessions } from "./sessions.ts";
import type { Recorder } from "./summaries.ts";
import {
  createRecorder,
  itemOf,
  itemOfPageRow,
  positionOf,
} from "./summaries.ts";

/** A person's session on a document ends after this without a push of theirs. */
const SESSION_IDLE_MS = 600_000;
/** An uploaded version's id: what a list cursor can carry. */
export const VERSION_ID = /^[A-Za-z0-9_-]{1,64}$/;

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

export interface HistoryService extends SyncHooks, Attribution {
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
  restore(
    userId: string,
    body: RestoreRequest,
  ): Promise<HistoryOutcome<RestoreResponse>>;
  /** Inside the caller's transaction: the row, its snapshot and its summary. `content` absent: the document at its head now. */
  keep(file: DocFile, version: VersionRow, content?: VersionContent): void;
  /** Thins, fixes, purges and sweeps the document's history now. */
  maintain(docId: string): void;
}

export function createHistoryService(options: {
  sync: () => SyncService;
  storage: Storage;
  clock: Clock;
  ids(): string;
  extras?: HistoryExtras;
  /** Told of each named draft after its commit; absent, nobody is. */
  draftEvents?: DraftEvents;
}): HistoryService {
  const { storage, clock, extras } = options;
  const locksAt: LocksAt = (file, docId, at) =>
    extras?.locksAt(file, docId, at) ?? null;
  const recorder = createRecorder({ ...options, locksAt });
  const maintenance = createMaintenance({ storage, clock, locksAt });

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
  function announce(docId: string, control: HistoryControl): void {
    const data = new TextEncoder().encode(JSON.stringify(control));
    options.sync().broadcast(docId, control.kind, data);
    maintenance.soon(docId);
  }
  const restorer = createRestorer({ ...options, recorder, locksAt, announce });

  const { inChain, requested } = createHistoryRequests({ announce });
  const named = createNamedVersions({
    ...options,
    recorder,
    locksAt,
    requested,
    authorize,
  });

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
          announce(docId, controlOf("version_created", outcome.item));
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
      const rows = file.history.pageDetails(docId, cursor, limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const more = rows.length > limit && last !== undefined;
      return {
        ok: true,
        value: {
          versions: page.map((version) =>
            itemOfPageRow(version, row.engineVersion),
          ),
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
    name: named.name,
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
    async restore(userId, body) {
      const access = authorize(userId, body.docId, "edit");
      if (!access.ok) return access;
      if (!isReplayKey(body.key)) return failed("bad_request");
      const restore = () => restorer.restore(access.file, userId, body);
      return inChain(body.docId, restore);
    },
    keep: createKeep({ recorder, locksAt, extras }),
    ...createAttribution({ authorize }),
    maintain: maintenance.now,
  };
}
