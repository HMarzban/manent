// The sent-draft routes: sending a draft, listing sends for editors, opening a draft link, comparing an earlier draft and rendering its PDF.
import {
  SHARE_LINK_EXPIRIES_MS,
  isDocId,
  isReplayKey,
} from "@manent/sync-protocol";
import type {
  DraftSendsResponse,
  SendDraftLinkInput,
  SendDraftRequest,
} from "@manent/sync-protocol";
import type {
  DraftsOutcome,
  DraftsRefusal,
  DraftsService,
} from "../../drafts/service.ts";
import { isLinkToken } from "../../sharing/links.ts";
import { failure, json, readJsonBody } from "../respond.ts";
import type { Route, RouteContext } from "../route.ts";
import type { ServerConfig } from "../server.ts";
import { isObject } from "./docs.ts";

const STATUS: Readonly<Record<DraftsRefusal, number>> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_member: 403,
  not_found: 404,
  not_sent: 404,
  unsupported_kind: 400,
  deleted: 410,
  link_expired: 410,
  link_revoked: 410,
  engine_unavailable: 422,
  busy: 429,
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

function isRelayed(config: ServerConfig, docId: string): boolean {
  const mode = config.sync?.mode;
  return typeof mode === "function" && mode(docId) === "relay";
}

function servedDrafts(
  context: RouteContext,
): { drafts: DraftsService; config: ServerConfig } | Response {
  const { sync, drafts } = context.config;
  if (sync === null || drafts === undefined || sync.mode === "relay")
    return failure("not_found", 404);
  return { drafts, config: context.config };
}

function answer<T>(outcome: DraftsOutcome<T>): Response {
  return outcome.ok
    ? json<T>(outcome.value)
    : failure(outcome.code, STATUS[outcome.code]);
}

function readLinkInput(value: unknown): SendDraftLinkInput | null | "invalid" {
  if (value === null) return null;
  if (!isObject(value)) return "invalid";
  const { expiresInMs, signIn } = value;
  const expiry = SHARE_LINK_EXPIRIES_MS.find((entry) => entry === expiresInMs);
  if (expiry === undefined || typeof signIn !== "boolean") return "invalid";
  return { expiresInMs: expiry, signIn };
}

function readSendRequest(body: unknown): SendDraftRequest | null {
  if (!isObject(body)) return null;
  const {
    docId,
    key,
    name,
    what,
    againstVersionId,
    files,
    groupIds,
    recipientUserIds,
    watermark,
  } = body;
  if (!isDocId(docId) || !isReplayKey(key)) return null;
  if (typeof name !== "string" || typeof what !== "string") return null;
  if (againstVersionId !== null && typeof againstVersionId !== "string")
    return null;
  if (
    !isStringArray(files) ||
    !isStringArray(groupIds) ||
    !isStringArray(recipientUserIds)
  )
    return null;
  if (typeof watermark !== "boolean") return null;
  const link = readLinkInput(body.link);
  if (link === "invalid") return null;
  return {
    docId,
    key,
    name,
    what,
    againstVersionId,
    files,
    groupIds,
    recipientUserIds,
    watermark,
    link,
  };
}

function readToken(body: unknown): string | null {
  if (!isObject(body) || !isLinkToken(body.token)) return null;
  return body.token;
}

export const DRAFTS_ROUTES: readonly Route[] = [
  {
    method: "POST",
    path: "/api/drafts/send",
    async handle(context) {
      const served = servedDrafts(context);
      if (served instanceof Response) return served;
      const { history } = served.config;
      if (history === undefined) return failure("not_found", 404);
      const identity = context.user();
      if (identity === null) return failure("unauthenticated", 401);
      const parsed = await readJsonBody(context.request);
      const body = parsed.ok ? readSendRequest(parsed.body) : null;
      if (body === null) return failure("bad_request", 400);
      if (isRelayed(served.config, body.docId))
        return failure("not_found", 404);
      return answer(
        await served.drafts.send(identity.userId, body, history.keep),
      );
    },
  },
  {
    method: "POST",
    path: "/api/drafts/sends",
    async handle(context) {
      const served = servedDrafts(context);
      if (served instanceof Response) return served;
      const identity = context.user();
      if (identity === null) return failure("unauthenticated", 401);
      const parsed = await readJsonBody(context.request);
      const docId =
        parsed.ok && isObject(parsed.body) && isDocId(parsed.body.docId)
          ? parsed.body.docId
          : null;
      if (docId === null) return failure("bad_request", 400);
      if (isRelayed(served.config, docId)) return failure("not_found", 404);
      const outcome = served.drafts.sends(identity.userId, docId);
      return outcome.ok
        ? json<DraftSendsResponse>({ sends: outcome.value })
        : failure(outcome.code, STATUS[outcome.code]);
    },
  },
  {
    method: "POST",
    path: "/api/drafts/open",
    async handle(context) {
      const served = servedDrafts(context);
      if (served instanceof Response) return served;
      const parsed = await readJsonBody(context.request);
      const token = parsed.ok ? readToken(parsed.body) : null;
      if (token === null) return failure("bad_request", 400);
      const userId = context.user()?.userId ?? null;
      return answer(served.drafts.open(userId, token));
    },
  },
  {
    method: "GET",
    path: "/api/drafts/since",
    handle(context) {
      const served = servedDrafts(context);
      if (served instanceof Response) return served;
      const query = new URL(context.request.url).searchParams;
      const token = query.get("token");
      const since = query.get("since");
      if (!isLinkToken(token) || since === null || since === "")
        return failure("bad_request", 400);
      const userId = context.user()?.userId ?? null;
      return answer(served.drafts.since(userId, token, since));
    },
  },
  {
    method: "POST",
    path: "/api/drafts/pdf",
    async handle(context) {
      const served = servedDrafts(context);
      if (served instanceof Response) return served;
      const parsed = await readJsonBody(context.request);
      const token = parsed.ok ? readToken(parsed.body) : null;
      if (token === null) return failure("bad_request", 400);
      const userId = context.user()?.userId ?? null;
      const outcome = await served.drafts.pdf(userId, token);
      return outcome.ok
        ? new Response(new Uint8Array(outcome.value), {
            headers: { "Content-Type": "application/pdf" },
          })
        : failure(outcome.code, STATUS[outcome.code]);
    },
  },
];
