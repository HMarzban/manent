// What the server's HTTP routes and the demo's server control answer, and what a client sends them.
import { fromBase64, toBase64 } from "lib0/buffer";
import type { DocKind } from "./doc-id.ts";
import type { Capability, DocRole } from "./messages.ts";

export const HTTP_ERROR_CODES = [
  "bad_request",
  "forbidden_host",
  "forbidden_origin",
  "not_found",
  "unauthenticated",
  "unknown_user",
  "deleted",
  "exists_elsewhere",
  "forbidden",
  "unsupported_kind",
  "busy",
  "generation_current",
  "incomplete",
  "invalid",
  "past_window",
  "too_large",
  "unknown_generation",
  "unreachable",
  "not_restorable",
  "already_issued",
  "already_locked",
  "changed",
  "engine_unavailable",
  "not_locked",
  "recall_closed",
  "unknown_label",
] as const;

export type HttpErrorCode = (typeof HTTP_ERROR_CODES)[number];

export function isHttpErrorCode(value: unknown): value is HttpErrorCode {
  return HTTP_ERROR_CODES.some((code) => code === value);
}

export interface ErrorResponse {
  error: HttpErrorCode;
}

export interface HealthResponse {
  ok: true;
}

export interface Identity {
  userId: string;
  name: string;
}

/** One person a visitor may sign in as; `title` is a line of description, never an access level. */
export interface SignInChoice {
  userId: string;
  name: string;
  title: string;
  /** False for a person who starts without an account: choosing them issues no session. */
  registered: boolean;
}

/** The answer to GET /api/sign-in. */
export interface SignInOptions {
  choices: readonly SignInChoice[];
}

/** The answer to POST /api/sign-in. */
export interface SignInResponse {
  token: string;
  user: Identity;
}

export interface WorkspaceRef {
  id: string;
  name: string;
  /** Null once the workspace is ready. */
  seeding: { done: number; total: number } | null;
}

/** The answer to GET /api/me. */
export interface MeResponse extends Identity {
  workspaces: readonly WorkspaceRef[];
}

/** The answer to POST /api/ws-ticket: a single-use ticket that opens the sync socket. */
export interface WsTicketResponse {
  ticket: string;
  /** How long the ticket can be redeemed. */
  expiresInMs: number;
}

/**
 * The body of POST /api/docs. Repeating it with the same `docId` changes nothing,
 * so a document made offline can be created later.
 */
export interface CreateDocumentRequest {
  docId: string;
  kind: string;
  /** "user" (the caller's own file) or "project:<uuid>". */
  home: string;
  /** The workspace whose index's roles a new script takes: 1 to 64 of A-Z, a-z, 0-9, _ and -. A reader that does not know it ignores it. */
  workspaceId?: string;
}

/** The answer to POST /api/docs. */
export interface CreateDocumentResponse {
  docId: string;
  kind: DocKind;
  home: string;
  generation: number;
  /** False when the document already existed. */
  created: boolean;
}

/**
 * The body of POST /api/docs/adopt: a document made on a device, handed to the server with its whole state. A retry
 * under the same `key` changes nothing.
 */
export interface AdoptRequest {
  /** A canonical lower-case UUID (`isDocId`), made once per hand-off. */
  key: string;
  docId: string;
  kind: string;
  /** As `CreateDocumentRequest.home`. */
  home: string;
  /** As `CreateDocumentRequest.workspaceId`; null for none. */
  workspaceId: string | null;
  /** Base64 of one Yjs update. */
  state: string;
}

/** The answer to POST /api/docs/adopt. */
export interface AdoptResponse {
  docId: string;
  kind: DocKind;
  home: string;
  generation: number;
  /** The sequence the adopted state was written at. */
  adoptedSeq: number;
  /** False for a retry under the key already recorded. */
  created: boolean;
}

/** The body of POST /api/docs/describe. */
export interface DescribeRequest {
  docId: string;
}

/** The answer to POST /api/docs/describe: where the document lives and what the caller may do with it. */
export interface DescribeResponse {
  docId: string;
  kind: DocKind;
  home: string;
  generation: number;
  role: DocRole;
  capabilities: Capability[];
}

/** The body of POST /api/docs/remove; repeating it changes nothing. */
export interface RemoveDocumentRequest {
  docId: string;
}

/** The answer to POST /api/docs/remove. */
export interface RemoveDocumentResponse {
  removed: true;
}

/** The body of POST /api/docs/clients: at most 64 client ids of one document. */
export interface DocClientsRequest {
  docId: string;
  clientIds: number[];
}

/** The answer to POST /api/docs/clients: only the ids the server has registered, in ascending `clientId`. */
export interface DocClientsResponse {
  clients: { clientId: number; userId: string; name: string }[];
}

/** The body of POST /api/docs/removed. */
export interface RemovedDocRequest {
  docId: string;
}

/** The answer to POST /api/docs/removed: who deleted the document, and when. */
export interface RemovedDocResponse {
  deletedByUserId: string;
  deletedByName: string;
  deletedAt: number;
}

export interface ControlEndpoint {
  url: string;
  token: string;
}

/** The answer to GET /api/demo. */
export interface DemoResponse {
  demo: true;
  seedId: string | null;
  control: ControlEndpoint | null;
}

export const SERVER_STATES = [
  "running",
  "stopped",
  "starting",
  "failed",
] as const;

export type ServerState = (typeof SERVER_STATES)[number];

export function isServerState(value: unknown): value is ServerState {
  return SERVER_STATES.some((state) => state === value);
}

/** Every answer of the demo's server control. */
export interface ControlStatusResponse {
  server: ServerState;
}

/** The body of POST /api/docs/replay: edits made against a generation the document has since left. */
export interface ReplayRequest {
  docId: string;
  /** The generation the edits were made against. */
  generation: number;
  /** The device's last acknowledged sequence in that generation. */
  lastServerSeq: number;
  /** The idempotency key: a retry under it changes nothing (`isReplayKey`). */
  key: string;
  /** The waiting updates, oldest first, as `encodeReplayUpdates` gives them. */
  updates: string[];
}

/** This device's text of a block both sides changed so that the changes touch. */
export interface ReplayOverlap {
  blockId: string;
  text: string;
}

/** Text that could not be placed: the block it came from and the block it sat near, each null when there is none. */
export interface ReplaySetAside {
  blockId: string | null;
  nearBlockId: string | null;
  text: string;
}

/** The answer to POST /api/docs/replay. */
export interface ReplayResponse {
  docId: string;
  /** The generation the result is in. */
  generation: number;
  /** The document's head sequence after the write. */
  serverSeq: number;
  /** The number of blocks written. */
  applied: number;
  overlaps: ReplayOverlap[];
  setAside: ReplaySetAside[];
}

/** The codes POST /api/docs/replay refuses with, each one of `HTTP_ERROR_CODES`. */
export const REPLAY_REFUSALS = [
  "bad_request",
  "busy",
  "deleted",
  "forbidden",
  "generation_current",
  "incomplete",
  "invalid",
  "not_found",
  "past_window",
  "too_large",
  "unknown_generation",
] as const;

export type ReplayRefusal = (typeof REPLAY_REFUSALS)[number];

const REPLAY_KEY = /^[0-9a-f]{32}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** An idempotency key: 16 random bytes as 32 lower-case hexadecimal characters. */
export function isReplayKey(value: unknown): value is string {
  return typeof value === "string" && REPLAY_KEY.test(value);
}

export function encodeReplayUpdates(updates: readonly Uint8Array[]): string[] {
  return updates.map((update) => toBase64(update));
}

export function isBase64(value: unknown): value is string {
  return (
    typeof value === "string" && value.length % 4 === 0 && BASE64.test(value)
  );
}

/** Null for anything that is not an array of base64 strings. */
export function decodeReplayUpdates(value: unknown): Uint8Array[] | null {
  if (!Array.isArray(value) || !value.every(isBase64)) return null;
  return value.map((update) => fromBase64(update));
}
