// The Public REST API service: API key management (session-authenticated) and read-only /api/v1/* endpoints (API-key-authenticated).
import {
  IMPORT_MAP,
  IMPORT_RECORD_KEY,
  NOTES_MAP,
  jsonMap,
  scriptBody,
  scriptSettings,
} from "@manent/crdt";
import {
  compileInk,
  inkSourceOf,
  parseImportRecord,
  writeFdx,
} from "@manent/formats";
import { FORMATS, isScriptNote } from "@manent/schema";
import type { BlockJSON, FormatId } from "@manent/schema";
import type { ApiKeyRow, Storage } from "@manent/storage";
import { indexDocId } from "@manent/sync-protocol";
import type {
  ApiKeyCreateResponse,
  ApiKeyRevokeResponse,
  ApiKeyView,
  ApiKeysListResponse,
  PublicApiFolderResponse,
  PublicApiLine,
  PublicApiLinesResponse,
} from "@manent/sync-protocol";
import type { Clock } from "../sync/ports.ts";
import { createKeyLimiter } from "./key-limits.ts";
import {
  committedDoc,
  listWorkspaceFolder,
  resolveWorkspaceDocument,
} from "./scope.ts";

/** Prefix required on every workspace API key bearer secret. */
export const API_KEY_PREFIX = "mk_";

const KEY_RANDOM_BYTES = 32;
const MAX_KEY_NAME_LENGTH = 120;
const MAX_TOKEN_LENGTH = 128;
const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const BEARER = /^Bearer +(\S+)$/i;
const SAFE_FILENAME_CHARS = new RegExp("[^A-Za-z0-9._ -]+", "g");

export type PublicApiRefusal =
  | "unauthenticated"
  | "forbidden"
  | "bad_request"
  | "not_found"
  | "unsupported_kind"
  | "invalid"
  | "rate_limited";

export type PublicApiOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: PublicApiRefusal;
      readonly retryAfterSec?: number;
    };

export interface PublicApiFdxResult {
  readonly xml: string;
  readonly filename: string;
}

export interface PublicApiInkResult {
  readonly json: string;
}

/** Public REST API and workspace API key management service carried on ServerConfig.publicApi. */
export interface PublicApiService {
  /** Lists folders, projects, and documents at folderId (null = top level) for the authenticated key's workspace. */
  folder(
    authHeader: string | null,
    folderId: string | null,
  ): Promise<PublicApiOutcome<PublicApiFolderResponse>>;
  /** Returns blocks as `{ id, type, text }` lines for a document in the authenticated key's workspace. */
  lines(
    authHeader: string | null,
    docId: string,
  ): Promise<PublicApiOutcome<PublicApiLinesResponse>>;
  /** Exports a script document in the authenticated key's workspace to Final Draft XML. */
  fdx(
    authHeader: string | null,
    docId: string,
  ): Promise<PublicApiOutcome<PublicApiFdxResult>>;
  /** Compiles an Ink document in the authenticated key's workspace to Ink JSON. */
  ink(
    authHeader: string | null,
    docId: string,
  ): Promise<PublicApiOutcome<PublicApiInkResult>>;
  /** Lists workspace API keys for a verified session member (never returns secrets or hashes). */
  listKeys(
    callerUserId: string,
    workspaceId: string,
  ): PublicApiOutcome<ApiKeysListResponse>;
  /** Creates a new workspace API key for a verified workspace owner; returns the plaintext key once. */
  createKey(
    callerUserId: string,
    workspaceId: string,
    name: string,
  ): Promise<PublicApiOutcome<ApiKeyCreateResponse>>;
  /** Revokes an active key in workspaceId for a verified workspace owner and drops its rate-limit bucket. */
  revokeKey(
    callerUserId: string,
    workspaceId: string,
    id: string,
  ): PublicApiOutcome<ApiKeyRevokeResponse>;
}

export interface PublicApiServiceOptions {
  readonly storage: Storage;
  readonly clock: Clock;
  readonly ids: () => string;
  readonly randomBytes: (length: number) => Uint8Array;
  readonly perSecond?: number;
  readonly burst?: number;
}

const refused = (
  code: PublicApiRefusal,
  retryAfterSec?: number,
): PublicApiOutcome<never> =>
  retryAfterSec === undefined
    ? { ok: false, code }
    : { ok: false, code, retryAfterSec };

const isValidWorkspaceId = (value: string): boolean =>
  WORKSPACE_ID_PATTERN.test(value);

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256(text: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

function toKeyView(row: ApiKeyRow): ApiKeyView {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  };
}

function sanitizeFdxFilename(title: string): string {
  const cleaned = title.replace(SAFE_FILENAME_CHARS, "_").trim().slice(0, 120);
  const base = cleaned.length > 0 ? cleaned : "script";
  return base.toLowerCase().endsWith(".fdx") ? base : `${base}.fdx`;
}

function blocksToLines(blocks: readonly BlockJSON[]): PublicApiLine[] {
  return blocks.map((block) => ({
    id: typeof block.attrs?.id === "string" ? block.attrs.id : "",
    type: typeof block.attrs?.type === "string" ? block.attrs.type : "action",
    text: (block.content ?? []).map((run) => run.text).join(""),
  }));
}

function resolveScriptFormat(raw: unknown): FormatId {
  return FORMATS.find((id) => id === raw) ?? "screenplay";
}

/** Creates the Public REST API and workspace API key management service. */
export function createPublicApiService(
  options: PublicApiServiceOptions,
): PublicApiService {
  const { storage, clock, ids, randomBytes } = options;
  const limiter = createKeyLimiter({
    now: clock.now,
    perSecond: options.perSecond,
    burst: options.burst,
  });

  /** Authenticates an `Authorization: Bearer mk_...` header strictly against active API keys. */
  async function authenticateKey(
    authHeader: string | null,
  ): Promise<PublicApiOutcome<ApiKeyRow>> {
    if (authHeader === null) return refused("unauthenticated");
    const token = BEARER.exec(authHeader.trim())?.[1];
    if (
      token === undefined ||
      token.length > MAX_TOKEN_LENGTH ||
      !token.startsWith(API_KEY_PREFIX)
    ) {
      return refused("unauthenticated");
    }
    const hash = await sha256(token);
    const row = storage.apiKeys.findByHash(hash);
    if (row === null || row.revokedAt !== null) {
      return refused("unauthenticated");
    }
    const taken = limiter.take(row.id);
    if (!taken.ok) {
      return refused("rate_limited", taken.retryAfterSec);
    }
    storage.apiKeys.touch(row.id);
    return { ok: true, value: row };
  }

  return {
    async folder(authHeader, folderId) {
      const auth = await authenticateKey(authHeader);
      if (!auth.ok) return auth;
      const listing = listWorkspaceFolder(
        storage,
        auth.value.workspaceId,
        folderId,
      );
      if (listing === null) return refused("not_found");
      return { ok: true, value: listing };
    },

    async lines(authHeader, docId) {
      const auth = await authenticateKey(authHeader);
      if (!auth.ok) return auth;
      const target = resolveWorkspaceDocument(
        storage,
        auth.value.workspaceId,
        docId,
      );
      if (target === null) return refused("not_found");
      const doc = committedDoc(storage, target.home, target.docId);
      if (doc === null) return refused("not_found");
      try {
        const materialized = scriptBody(doc).materialize();
        const blocks = (materialized.content ?? []).flatMap(
          (section) => section.content ?? [],
        );
        return {
          ok: true,
          value: { docId: target.docId, lines: blocksToLines(blocks) },
        };
      } finally {
        doc.destroy();
      }
    },

    async fdx(authHeader, docId) {
      const auth = await authenticateKey(authHeader);
      if (!auth.ok) return auth;
      const target = resolveWorkspaceDocument(
        storage,
        auth.value.workspaceId,
        docId,
      );
      if (target === null) return refused("not_found");
      if (target.kind !== "script") return refused("unsupported_kind");
      const doc = committedDoc(storage, target.home, target.docId);
      if (doc === null) return refused("not_found");
      try {
        const materialized = scriptBody(doc).materialize();
        const blocks = (materialized.content ?? []).flatMap(
          (section) => section.content ?? [],
        );
        const settings = scriptSettings(doc).entries();
        const format = resolveScriptFormat(settings["script.format"]);
        const notes = Object.entries(jsonMap(doc, NOTES_MAP).entries()).flatMap(
          ([id, note]) => (isScriptNote(note) ? [{ id, note }] : []),
        );
        const record = parseImportRecord(
          jsonMap(doc, IMPORT_MAP).get(IMPORT_RECORD_KEY),
        );
        const written = writeFdx({
          title: target.title,
          format,
          blocks,
          notes,
          record,
          production: null,
        });
        return {
          ok: true,
          value: {
            xml: written.text,
            filename: sanitizeFdxFilename(target.title),
          },
        };
      } finally {
        doc.destroy();
      }
    },

    async ink(authHeader, docId) {
      const auth = await authenticateKey(authHeader);
      if (!auth.ok) return auth;
      const target = resolveWorkspaceDocument(
        storage,
        auth.value.workspaceId,
        docId,
      );
      if (target === null) return refused("not_found");
      if (target.kind !== "ink") return refused("unsupported_kind");
      const doc = committedDoc(storage, target.home, target.docId);
      if (doc === null) return refused("not_found");
      try {
        const materialized = scriptBody(doc).materialize();
        const blocks = (materialized.content ?? []).flatMap(
          (section) => section.content ?? [],
        );
        const source = inkSourceOf(blocks);
        const compiled = compileInk(source);
        if (!compiled.ok) return refused("invalid");
        return { ok: true, value: { json: compiled.json } };
      } finally {
        doc.destroy();
      }
    },

    listKeys(callerUserId, workspaceId) {
      if (!isValidWorkspaceId(workspaceId)) return refused("bad_request");
      const role = storage.directory.roleOf(
        indexDocId("workspace", workspaceId),
        callerUserId,
      )?.role;
      if (role === undefined) return refused("forbidden");
      const keys = storage.apiKeys.list(workspaceId).map(toKeyView);
      return { ok: true, value: { keys } };
    },

    async createKey(callerUserId, workspaceId, name) {
      if (!isValidWorkspaceId(workspaceId)) return refused("bad_request");
      const trimmed = name.trim();
      if (trimmed.length === 0 || trimmed.length > MAX_KEY_NAME_LENGTH) {
        return refused("bad_request");
      }
      const role = storage.directory.roleOf(
        indexDocId("workspace", workspaceId),
        callerUserId,
      )?.role;
      if (role !== "owner") return refused("forbidden");

      const secret = `${API_KEY_PREFIX}${toBase64Url(randomBytes(KEY_RANDOM_BYTES))}`;
      const keyHash = await sha256(secret);
      const currentRole = storage.directory.roleOf(
        indexDocId("workspace", workspaceId),
        callerUserId,
      )?.role;
      if (currentRole !== "owner") return refused("forbidden");
      const created = storage.apiKeys.create({
        id: ids(),
        workspaceId,
        name: trimmed,
        keyHash,
        createdByUserId: callerUserId,
      });
      return {
        ok: true,
        value: { key: secret, row: toKeyView(created) },
      };
    },

    revokeKey(callerUserId, workspaceId, id) {
      if (!isValidWorkspaceId(workspaceId) || id.length === 0) {
        return refused("bad_request");
      }
      const role = storage.directory.roleOf(
        indexDocId("workspace", workspaceId),
        callerUserId,
      )?.role;
      if (role !== "owner") return refused("forbidden");
      const revoked = storage.apiKeys.revoke(workspaceId, id);
      if (!revoked) return refused("not_found");
      limiter.drop(id);
      return { ok: true, value: { ok: true } };
    },
  };
}
