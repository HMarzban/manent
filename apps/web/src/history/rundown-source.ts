// Rundown history helpers and shared HistorySource utilities: action keys, device content, rundown snapshot check and offline rundown restore.
import { ORIGIN_RESTORE, applyRundownRestore, readRundown } from "@manent/crdt";
import { planRundownRestore } from "@manent/revisions";
import type { RundownRestoreScope } from "@manent/revisions";
import { SCHEMA_VERSION } from "@manent/schema";
import type { RundownJSON } from "@manent/schema";
import { uploadRequestOf } from "@manent/sync-client";
import type { DeviceVersion, DocHandle } from "@manent/sync-client";
import type {
  RestoreRequest,
  RestoreScopeBody,
  VersionContent,
  VersionPosition,
} from "@manent/sync-protocol";
import { isRecord, isRestoreAnswer } from "./bodies.ts";
import { createHistoryHttp, readBody } from "./requests.ts";

const RESTORE_RETRY_MS = 2_000;

/** POST /api/versions/upload of a device version: true once the server holds it, or has said it never will (422). */
export function createUploader(options: {
  fetch: typeof fetch;
  token: () => string | null;
  deviceId: string;
}): (version: DeviceVersion) => Promise<boolean> {
  const http = createHistoryHttp(options);
  return async (version) => {
    try {
      const response = await http.post(
        "/api/versions/upload",
        uploadRequestOf(version, options.deviceId, SCHEMA_VERSION),
      );
      return response.status === 200 || response.status === 422;
    } catch {
      // the upload is tried again on the next connection
      return false;
    }
  };
}

/** A key per action, kept until the action has an answer, so that a retry of it sends the same key. */
export function createActionKeys(ids: () => string) {
  const kept = new Map<string, string>();
  return {
    of(action: string): string {
      const key = kept.get(action) ?? ids();
      kept.set(action, key);
      return key;
    },
    done(action: string): void {
      kept.delete(action);
    },
  };
}

export const cacheKeyOf = (
  docId: string,
  at: { versionId: string } | { position: VersionPosition },
): string =>
  "versionId" in at
    ? `${docId} version ${at.versionId}`
    : `${docId} position ${at.position.generation}:${at.position.seq}`;

/** The request can reach the server, and the server holds the document. */
export function isSent(handle: DocHandle): boolean {
  const status = handle.status.get();
  return status.link === "online" && !status.neverSynced;
}

/** True once the device has kept the version; false when its store refused it. */
export const isKept = (stored: Promise<unknown>): Promise<boolean> =>
  stored.then(
    () => true,
    () => false,
  );

/** Resolves at the next status whose link is online. */
export const nextOnline = (handle: DocHandle): Promise<void> =>
  new Promise((resolve) => {
    const stop = handle.status.subscribe((status) => {
      if (status.link !== "online") return;
      stop();
      resolve();
    });
  });

/** A device version's content, laid out with the script's settings as the device holds them now. */
export async function deviceContent(
  handle: DocHandle,
  versionId: string,
): Promise<VersionContent | null> {
  const version = (await handle.deviceVersions()).find(
    (v) => v.id === versionId,
  );
  if (version === undefined) return null;
  return {
    v: 1,
    blocks: (version.content.content ?? []).flatMap((s) => s.content ?? []),
    settings: { ...handle.settings.get() },
    schemaVersion: SCHEMA_VERSION,
    engineVersion: null,
    locks: null,
    authors: {},
  };
}

/** Shallow shape check for a `VersionContent.rundown` snapshot. */
export function isRundownSnapshot(value: unknown): value is RundownJSON {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.rundown) &&
    typeof value.rundown.airDate === "string" &&
    Array.isArray(value.columns) &&
    Array.isArray(value.rows)
  );
}

/** Returns `content.rundown` when valid, else null. */
export function rundownOfContent(
  content: VersionContent | null,
): RundownJSON | null {
  if (content === null || !isRundownSnapshot(content.rundown)) return null;
  return content.rundown;
}

/** Restores a rundown (full or single row) directly on `handle` when working offline with a cached snapshot. */
export function restoreRundownOnDevice(options: {
  readonly handle: DocHandle;
  readonly target: RundownJSON;
  readonly scope: RestoreScopeBody;
  readonly userId: string;
  readonly now: () => number;
  readonly ids: () => string;
}): { readonly ok: true; readonly beforeVersionId: string } {
  const { handle, target, scope, userId, now, ids } = options;
  const rundownScope: RundownRestoreScope =
    scope.kind === "row"
      ? { kind: "row", rowId: scope.rowId }
      : { kind: "all" };
  const doc = handle.doc();
  const at = now();
  const plan = planRundownRestore(readRundown(doc), target, rundownScope, {
    userId,
    now: at,
  });
  applyRundownRestore(doc, plan.ops, {
    userId,
    now: at,
    origin: ORIGIN_RESTORE,
  });
  return { ok: true, beforeVersionId: ids() };
}

/** Sends a restore request to the server, retrying on offline / 429 / 5xx with the same idempotency key. */
export async function postRestoreWithRetry(options: {
  readonly http: ReturnType<typeof createHistoryHttp>;
  readonly request: RestoreRequest;
  readonly handle: DocHandle;
  readonly refresh: (docId: string) => void;
}): Promise<
  | { readonly ok: true; readonly beforeVersionId: string }
  | { readonly ok: false; readonly reason: "offline" | "refused" }
> {
  const { http, request, handle, refresh } = options;
  const response = await http
    .post("/api/versions/restore", request)
    .catch(() => null);
  if (response === null) {
    await nextOnline(handle);
    return postRestoreWithRetry(options);
  }
  if (response.status === 429 || response.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, RESTORE_RETRY_MS));
    if (handle.status.get().link !== "online") await nextOnline(handle);
    return postRestoreWithRetry(options);
  }
  if (response.status === 409 || response.status === 422)
    return { ok: false, reason: "refused" };
  if (!response.ok)
    throw new Error(`POST /api/versions/restore answered ${response.status}`);
  const answer = await readBody(response, isRestoreAnswer);
  refresh(request.docId);
  if (answer === null)
    throw new Error(
      "POST /api/versions/restore answered a body this build cannot read",
    );
  return { ok: true, beforeVersionId: answer.value.beforeVersionId };
}
