// The Send draft HTTP requests, carrying the tab's session token, and runtime guards for every response.
import type {
  DraftSendGroup,
  DraftSendItem,
  DraftSendsResponse,
  SendDraftRequest,
  SendDraftResponse,
} from "@manent/sync-protocol";
import { readBody } from "../history/requests.ts";
import { readPerson, tabStorage } from "../session.ts";

export type DraftsFailure =
  "unauthenticated" | "forbidden" | "unreachable" | "refused";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);

const isGroupSummary = (value: unknown): value is DraftSendGroup =>
  isRecord(value) &&
  isString(value.groupId) &&
  isString(value.name) &&
  isCount(value.count) &&
  typeof value.watermark === "boolean";

const isDraftSendItem = (value: unknown): value is DraftSendItem =>
  isRecord(value) &&
  isString(value.sendId) &&
  isString(value.versionId) &&
  isString(value.name) &&
  isString(value.what) &&
  (value.againstVersionId === null || isString(value.againstVersionId)) &&
  isStringList(value.files) &&
  Array.isArray(value.groups) &&
  value.groups.every(isGroupSummary) &&
  isCount(value.recipientCount) &&
  isCount(value.openedCount) &&
  isStringList(value.openerUserIds) &&
  isStringList(value.openerNames) &&
  isCount(value.totalOpens) &&
  typeof value.hasLink === "boolean" &&
  typeof value.watermarked === "boolean" &&
  isString(value.sentByUserId) &&
  typeof value.sentAt === "number";

const isDraftSendsResponse = (value: unknown): value is DraftSendsResponse =>
  isRecord(value) &&
  Array.isArray(value.sends) &&
  value.sends.every(isDraftSendItem);

const isSendDraftResponse = (value: unknown): value is SendDraftResponse =>
  isRecord(value) &&
  isDraftSendItem(value.send) &&
  isRecord(value.version) &&
  (value.recipientToken === null || isString(value.recipientToken)) &&
  (value.linkToken === null || isString(value.linkToken));

/** Authorization header for `userId` only when this tab's session is that user's. */
function sessionHeaders(userId: string): Record<string, string> | null {
  const person = readPerson(tabStorage());
  const token = person?.userId === userId ? person.token : null;
  return token === null ? null : { Authorization: `Bearer ${token}` };
}

function statusFailure(status: number): DraftsFailure {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  return "refused";
}

async function postJson<T>(
  userId: string,
  path: string,
  body: unknown,
  guard: (value: unknown) => value is T,
): Promise<{ ok: true; value: T } | { ok: false; code: DraftsFailure }> {
  const auth = sessionHeaders(userId);
  if (auth === null) return { ok: false, code: "unauthenticated" };
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: "unreachable" };
  }
  if (!response.ok) return { ok: false, code: statusFailure(response.status) };
  const parsed = await readBody(response, guard);
  return parsed === null
    ? { ok: false, code: "refused" }
    : { ok: true, value: parsed.value };
}

export async function listDraftSends(
  userId: string,
  docId: string,
): Promise<
  | { ok: true; sends: readonly DraftSendItem[] }
  | { ok: false; code: DraftsFailure }
> {
  const answer = await postJson(
    userId,
    "/api/drafts/sends",
    { docId },
    isDraftSendsResponse,
  );
  if (!answer.ok) return answer;
  return {
    ok: true,
    sends: answer.value.sends.toSorted((a, b) => b.sentAt - a.sentAt),
  };
}

export async function postSendDraft(
  userId: string,
  request: SendDraftRequest,
): Promise<
  { ok: true; value: SendDraftResponse } | { ok: false; code: DraftsFailure }
> {
  return postJson(userId, "/api/drafts/send", request, isSendDraftResponse);
}
