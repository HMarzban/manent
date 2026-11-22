// The history of each script as this tab reads it: the versions listed, the content of each, and the requests that
// name, save and restore them. Each action's key is made once and sent again with every retry of that action.
import type { RestoreScope } from "@manent/revisions";
import { SCHEMA_VERSION } from "@manent/schema";
import { uploadRequestOf } from "@manent/sync-client";
import type { DeviceVersion, DocHandle } from "@manent/sync-client";
import type {
  AuthorsRequest,
  AuthorsResponse,
  SinceResponse,
  VersionContent,
  VersionPosition,
  WhoWroteResponse,
} from "@manent/sync-protocol";
import type { Subscribable, SurfaceStateValue } from "@manent/ui";
import {
  isAuthors,
  isContentAnswer,
  isRestoreAnswer,
  isSince,
  isWhoWrote,
} from "./bodies.ts";
import { createContentCache } from "./content-cache.ts";
import { docOfContent } from "./content-doc.ts";
import { readLastOpened } from "./last-opened.ts";
import { createHistoryHttp, readBody } from "./requests.ts";
import { createVersionLists } from "./version-list.ts";
import type { HistoryRow } from "./history-rows.ts";

export type { HistoryRow } from "./history-rows.ts";

export interface HistorySource {
  /** The device's rows first while the server's load. */
  rows(docId: string): Subscribable<{
    rows: readonly HistoryRow[];
    state: SurfaceStateValue;
    othersCanOpen: boolean | null;
  }>;
  /** Asks for the next page. */
  more(docId: string): void;
  /** From this tab's cache, then the device, then the server; null when none of them holds it. */
  content(
    docId: string,
    at: { versionId: string } | { position: VersionPosition },
  ): Promise<VersionContent | null>;
  /** Names Working (`fromVersionId` null) or that version as a draft. */
  name(
    docId: string,
    name: string,
    fromVersionId: string | null,
  ): Promise<{ ok: true } | { ok: false }>;
  save(docId: string): Promise<{ ok: true } | { ok: false }>;
  /**
   * On the server when the request can be sent, else on the device. A request sent whose answer was lost is sent
   * again whenever the link is next online, and the restore is then never made on the device; so is one the server
   * was too busy to take. `offline`: the version's content is not on the device. `refused`: the server cannot restore
   * that version (409 `not_restorable`, 422 `invalid`). Rejects on any other refusal, such as a role that cannot edit,
   * and on a success whose body cannot be read.
   */
  restore(
    docId: string,
    versionId: string,
    scope: RestoreScope,
  ): Promise<
    | { ok: true; beforeVersionId: string }
    | { ok: false; reason: "offline" | "refused" }
  >;
  /** Null when no author is recorded; rejects when the server cannot tell. */
  whoWrote(docId: string, blockId: string): Promise<WhoWroteResponse | null>;
  /** Null when the person has not opened the script on this device before, or the server cannot tell. */
  sinceOpened(docId: string): Promise<SinceResponse | null>;
  /** Of each of `blockIds`, the person of its last change after `since`; null when the server cannot tell. */
  authors(
    docId: string,
    since: AuthorsRequest["since"],
    blockIds: readonly string[],
  ): Promise<AuthorsResponse | null>;
}

const DONE = Object.freeze({ ok: true } as const);
const NOT_DONE = Object.freeze({ ok: false } as const);

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
function createActionKeys(ids: () => string) {
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

const cacheKeyOf = (
  docId: string,
  at: { versionId: string } | { position: VersionPosition },
): string =>
  "versionId" in at
    ? `${docId} version ${at.versionId}`
    : `${docId} position ${at.position.generation}:${at.position.seq}`;

/** The request can reach the server, and the server holds the script. */
function isSent(handle: DocHandle): boolean {
  const status = handle.status.get();
  return status.link === "online" && !status.neverSynced;
}

/** True once the device has kept the version; false when its store refused it. */
const isKept = (stored: Promise<unknown>): Promise<boolean> =>
  stored.then(
    () => true,
    () => false,
  );

/** The wait before a restore the server could not take then (429 busy, or 5xx) is sent again. */
const RESTORE_RETRY_MS = 2_000;

/** Resolves at the next status whose link is online. */
const nextOnline = (handle: DocHandle): Promise<void> =>
  new Promise((resolve) => {
    const stop = handle.status.subscribe((status) => {
      if (status.link !== "online") return;
      stop();
      resolve();
    });
  });

/** A device version's content, laid out with the script's settings as the device holds them now. */
async function deviceContent(
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

/**
 * `open` gives a view of the handle the document source already holds; the source closes each view it opens, once,
 * when it is done with it.
 */
export function createHistorySource(options: {
  fetch: typeof fetch;
  token: () => string | null;
  open: (docId: string) => Promise<DocHandle>;
  userId: string;
  now: () => number;
  ids: () => string;
}): HistorySource {
  const { userId } = options;
  const http = createHistoryHttp(options);
  const cache = createContentCache();
  const keys = createActionKeys(options.ids);
  const lists = createVersionLists({
    http,
    open: options.open,
    userId,
    now: options.now,
    opened: (docId, versionId) => cache.has(cacheKeyOf(docId, { versionId })),
  });

  async function withView<T>(
    docId: string,
    use: (handle: DocHandle) => Promise<T>,
  ): Promise<T> {
    const handle = await options.open(docId);
    try {
      return await use(handle);
    } finally {
      await handle.close();
    }
  }

  async function fromServer(
    docId: string,
    at: { versionId: string } | { position: VersionPosition },
  ): Promise<VersionContent | null> {
    const query: Record<string, string> =
      "versionId" in at
        ? { docId, versionId: at.versionId }
        : {
            docId,
            generation: String(at.position.generation),
            seq: String(at.position.seq),
          };
    try {
      const response = await http.get("/api/versions/content", query);
      if (!response.ok) return null;
      const answer = await readBody(response, isContentAnswer);
      if (answer === null) return null;
      cache.put(cacheKeyOf(docId, at), answer.value.content, answer.bytes);
      return answer.value.content;
    } catch {
      // the server cannot be reached: the content is not to be had now
      return null;
    }
  }

  /** True once the server has answered `action` with a success; a request that never reached it keeps its key. */
  async function sendKeyed(
    action: string,
    send: (key: string) => Promise<Response>,
  ): Promise<boolean> {
    try {
      const response = await send(keys.of(action));
      keys.done(action);
      return response.ok;
    } catch {
      // the next try of this action sends the same key
      return false;
    }
  }

  /** On the device: only a version whose content this tab or the device holds. */
  async function restoreOnDevice(
    docId: string,
    handle: DocHandle,
    versionId: string,
    scope: RestoreScope,
  ): ReturnType<HistorySource["restore"]> {
    const content =
      cache.get(cacheKeyOf(docId, { versionId })) ??
      (await deviceContent(handle, versionId));
    const target = content === null ? null : docOfContent(content);
    if (target === null) return { ok: false, reason: "offline" };
    const { beforeVersionId } = await handle.restoreLocally(target, scope);
    lists.refresh(docId);
    return { ok: true, beforeVersionId };
  }

  async function restoreOnServer(
    request: {
      docId: string;
      key: string;
      versionId: string;
      scope: RestoreScope;
    },
    handle: DocHandle,
  ): ReturnType<HistorySource["restore"]> {
    const response = await http
      .post("/api/versions/restore", request)
      .catch(() => null);
    if (response === null) {
      await nextOnline(handle);
      return restoreOnServer(request, handle);
    }
    if (response.status === 429 || response.status >= 500) {
      // the server answers a key it holds with its first result, so sending it again restores at most once
      await new Promise((resolve) => setTimeout(resolve, RESTORE_RETRY_MS));
      if (handle.status.get().link !== "online") await nextOnline(handle);
      return restoreOnServer(request, handle);
    }
    if (response.status === 409 || response.status === 422)
      return { ok: false, reason: "refused" };
    if (!response.ok)
      throw new Error(`POST /api/versions/restore answered ${response.status}`);
    const answer = await readBody(response, isRestoreAnswer);
    lists.refresh(request.docId);
    if (answer === null)
      throw new Error(
        "POST /api/versions/restore answered a body this build cannot read",
      );
    return { ok: true, beforeVersionId: answer.value.beforeVersionId };
  }

  return {
    rows: (docId) => lists.rows(docId),
    more: (docId) => lists.more(docId),
    async content(docId, at) {
      const kept = cache.get(cacheKeyOf(docId, at));
      if (kept !== null) return kept;
      const local =
        "versionId" in at
          ? await withView(docId, (handle) =>
              deviceContent(handle, at.versionId),
            )
          : null;
      return local ?? fromServer(docId, at);
    },
    name: (docId, name, fromVersionId) =>
      withView(docId, async (handle) => {
        // offline only Working can be named, as a device version
        const named = isSent(handle)
          ? await sendKeyed(`name ${docId} ${fromVersionId} ${name}`, (key) =>
              http.post("/api/versions/name", {
                docId,
                key,
                name,
                fromVersionId,
              }),
            )
          : fromVersionId === null && (await isKept(handle.nameVersion(name)));
        if (named) lists.refresh(docId);
        return named ? DONE : NOT_DONE;
      }),
    save: (docId) =>
      withView(docId, async (handle) => {
        const saved = isSent(handle)
          ? await sendKeyed(`save ${docId}`, (key) =>
              http.post("/api/versions/save", { docId, key, kind: "saved" }),
            )
          : await isKept(handle.saveVersion("manual"));
        if (saved) lists.refresh(docId);
        return saved ? DONE : NOT_DONE;
      }),
    restore: (docId, versionId, scope) =>
      withView(docId, (handle) =>
        isSent(handle)
          ? restoreOnServer(
              { docId, key: options.ids(), versionId, scope },
              handle,
            )
          : restoreOnDevice(docId, handle, versionId, scope),
      ),
    async whoWrote(docId, blockId) {
      const response = await http.get("/api/versions/who", { docId, blockId });
      if (response.status === 404) return null;
      if (!response.ok)
        throw new Error(`GET /api/versions/who answered ${response.status}`);
      const answer = await readBody(response, isWhoWrote);
      if (answer === null)
        throw new Error(
          "GET /api/versions/who answered a body this build cannot read",
        );
      return answer.value;
    },
    async sinceOpened(docId) {
      const at = readLastOpened(userId, docId);
      if (at === null) return null;
      try {
        const response = await http.get("/api/versions/since", {
          docId,
          generation: String(at.generation),
          seq: String(at.seq),
        });
        if (!response.ok) return null;
        return (await readBody(response, isSince))?.value ?? null;
      } catch {
        // the server cannot be reached: nothing is said about others' changes
        return null;
      }
    },
    async authors(docId, since, blockIds) {
      try {
        const response = await http.post("/api/versions/authors", {
          docId,
          since,
          blockIds,
        });
        if (!response.ok) return null;
        return (await readBody(response, isAuthors))?.value ?? null;
      } catch {
        // the server cannot be reached: the changes are not told apart by person
        return null;
      }
    },
  };
}
