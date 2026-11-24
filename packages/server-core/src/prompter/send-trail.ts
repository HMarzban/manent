// Prompter request helpers: per-rundown serialization, send trail, authorization and broadcasts.
import { readRundown } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { RundownRowJSON } from "@manent/schema";
import type { DocFile, Home, PrompterSendRow, Storage } from "@manent/storage";
import { isDocId, isRequestKey } from "@manent/sync-protocol";
import type {
  HistoryControl,
  PrompterSendRequest,
  PrompterSendResponse,
} from "@manent/sync-protocol";
import type { SyncService } from "../sync/ports.ts";
import { isValidStoryInHome } from "./projection.ts";

export type RowCheck =
  | { ok: true; row: RundownRowJSON; storyId: string }
  | { ok: false; reason: "not_in_rundown" | "cannot_send" | "forbidden" };

export type PrompterRefusal =
  | "bad_request"
  | "forbidden"
  | "not_in_rundown"
  | "cannot_send"
  | "deleted"
  | "busy";

export type PrompterOutcome<T> =
  { ok: true; value: T } | { ok: false; code: PrompterRefusal };

export interface PreviousStep {
  readonly target: PrompterSendRow;
  readonly nextTrail: PrompterSendRow[];
  readonly nextCursor: number;
}

interface TrailEntry {
  trail: PrompterSendRow[];
  cursor: number;
}

export interface SendTrail {
  record(rundownId: string, rowId: string, send: PrompterSendRow): void;
  peekPrevious(
    file: DocFile,
    rundownId: string,
    rowId: string,
  ): PreviousStep | null;
  commitPrevious(rundownId: string, rowId: string, step: PreviousStep): void;
  drop(rundownId: string, rowId: string): void;
}

const encodeJson = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(value));

const rowKey = (rundownId: string, rowId: string): string =>
  `${rundownId}:${rowId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Parses a stored JSON response; null for text this service did not write. */
function readStoredSendResponse(text: string): PrompterSendResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // malformed stored JSON is never replayed as a valid answer
    return null;
  }
  if (!isRecord(parsed)) return null;
  const { rowId, storyId, versionId, sentAt, senderUserId } = parsed;
  if (typeof rowId !== "string" || typeof storyId !== "string") return null;
  if (versionId !== null && typeof versionId !== "string") return null;
  if (typeof sentAt !== "number" || !Number.isSafeInteger(sentAt)) return null;
  if (senderUserId !== null && typeof senderUserId !== "string") return null;
  return { rowId, storyId, versionId, sentAt, senderUserId };
}

/** Monotonically increasing timestamp per `(rundownId, rowId)` so same-ms sends never collide. */
export function nextSentAt(
  file: DocFile,
  rundownId: string,
  rowId: string,
  now: number,
): number {
  const latest = file.prompter.latest(rundownId, rowId);
  return latest === null ? now : Math.max(now, latest.sentAt + 1);
}

export function checkSendableRow(
  storage: Storage,
  sync: SyncService,
  doc: CrdtDoc,
  home: Home,
  file: DocFile,
  userId: string,
  rowId: string,
): RowCheck {
  const row = readRundown(doc).rows.find((r) => r.id === rowId);
  if (row === undefined) return { ok: false, reason: "not_in_rundown" };
  if (row.kind !== "script" || row.docId === null)
    return { ok: false, reason: "cannot_send" };
  if (
    !isValidStoryInHome(storage, home, row.docId) ||
    file.log.get(row.docId) === null
  )
    return { ok: false, reason: "cannot_send" };
  if (!sync.access.resolve(userId, row.docId).ok)
    return { ok: false, reason: "forbidden" };
  return { ok: true, row, storyId: row.docId };
}

export function mapWriteRefusal(reason: string): PrompterRefusal {
  if (reason === "forbidden") return "forbidden";
  if (reason === "not_in_rundown") return "not_in_rundown";
  if (reason === "cannot_send") return "cannot_send";
  return "busy";
}

/** Replays a stored idempotent response only when it belongs to `userId` and is well formed. */
export function replayStoredRequest(
  file: DocFile,
  docId: string,
  key: string,
  userId: string,
): PrompterOutcome<PrompterSendResponse> | null {
  const stored = file.prompter.request(docId, key);
  if (stored === null) return null;
  if (stored.userId !== userId) return { ok: false, code: "bad_request" };
  const parsed = readStoredSendResponse(stored.result);
  return parsed === null
    ? { ok: false, code: "bad_request" }
    : { ok: true, value: parsed };
}

/** Validates shape, non-deleted state, `send_to_prompter` capability and rundown kind from server state. */
export function authorizePrompterRequest(
  storage: Storage,
  sync: SyncService,
  userId: string,
  request: PrompterSendRequest,
):
  | { ok: true; home: Home; file: DocFile }
  | { ok: false; code: PrompterRefusal } {
  const { docId, rowId, key } = request;
  if (
    !isDocId(docId) ||
    typeof rowId !== "string" ||
    rowId.length === 0 ||
    !isRequestKey(key)
  )
    return { ok: false, code: "bad_request" };
  if (storage.directory.tombstoneOf(docId) !== null)
    return { ok: false, code: "deleted" };
  const capabilities = sync.access.capabilitiesOf(userId, docId);
  if (capabilities === null || !capabilities.includes("send_to_prompter"))
    return { ok: false, code: "forbidden" };
  const place = storage.directory.placeOf(docId);
  if (place === null || place.kind !== "rundown")
    return { ok: false, code: "not_in_rundown" };
  return { ok: true, home: place.home, file: storage.open(place.home) };
}

/** Records a send row and its idempotent request response in one file transaction. */
export function storePrompterSend(
  file: DocFile,
  sendRow: PrompterSendRow,
  request: { key: string; userId: string },
): PrompterSendResponse {
  file.prompter.record(sendRow);
  const response: PrompterSendResponse = {
    rowId: sendRow.rowId,
    storyId: sendRow.storyId,
    versionId: sendRow.versionId,
    sentAt: sendRow.sentAt,
    senderUserId: sendRow.senderUserId,
  };
  file.prompter.putRequest({
    docId: sendRow.rundownId,
    key: request.key,
    userId: request.userId,
    result: JSON.stringify(response),
    createdAt: sendRow.sentAt,
  });
  return response;
}

export function announcePrompterVersion(
  sync: SyncService,
  storyId: string,
  userId: string,
  versionId: string,
  sentAt: number,
): void {
  const control: HistoryControl = {
    kind: "version_created",
    versionId,
    userId,
    at: sentAt,
    name: null,
    versionAt: sentAt,
    scene: null,
    beforeVersionId: null,
  };
  sync.broadcast(storyId, "version_created", encodeJson(control));
}

export function announcePrompterSent(
  sync: SyncService,
  rundownId: string,
  response: PrompterSendResponse,
): void {
  sync.broadcast(rundownId, "sent_to_prompter", encodeJson(response));
}

/** Serializes async operations per rundown id so sends and state updates never race. */
export function createRundownChain(): <T>(
  rundownId: string,
  run: () => Promise<T>,
) => Promise<T> {
  const chains = new Map<string, Promise<void>>();
  return function inChain<T>(
    rundownId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const before = chains.get(rundownId);
    const next = before === undefined ? run() : before.then(run);
    const tail = next.then(
      () => {},
      () => {},
    );
    chains.set(rundownId, tail);
    void tail.then(() => {
      if (chains.get(rundownId) === tail) chains.delete(rundownId);
    });
    return next;
  };
}

/** Tracks each row's send trail so repeated Send previous steps back one send at a time. */
export function createSendTrail(): SendTrail {
  const trails = new Map<string, TrailEntry>();
  return {
    record(rundownId, rowId, send) {
      const key = rowKey(rundownId, rowId);
      const existing = trails.get(key);
      const base =
        existing === undefined
          ? []
          : existing.trail.slice(0, existing.cursor + 1);
      const trail = [...base, send];
      trails.set(key, { trail, cursor: trail.length - 1 });
    },
    peekPrevious(file, rundownId, rowId) {
      const existing = trails.get(rowKey(rundownId, rowId));
      if (existing !== undefined) {
        if (existing.cursor <= 0) return null;
        const nextCursor = existing.cursor - 1;
        return {
          target: existing.trail[nextCursor]!,
          nextTrail: existing.trail,
          nextCursor,
        };
      }
      const latest = file.prompter.latest(rundownId, rowId);
      const prev = file.prompter.previous(rundownId, rowId);
      if (latest === null || prev === null) return null;
      return { target: prev, nextTrail: [prev, latest], nextCursor: 0 };
    },
    commitPrevious(rundownId, rowId, step) {
      trails.set(rowKey(rundownId, rowId), {
        trail: step.nextTrail,
        cursor: step.nextCursor,
      });
    },
    drop(rundownId, rowId) {
      trails.delete(rowKey(rundownId, rowId));
    },
  };
}
