// HTTP requests, response parsers and message builders for Send to prompter and Send previous.
import type {
  PrompterSendRequest,
  PrompterSendResponse,
} from "@manent/sync-protocol";
import { PROMPTER_WORDS, formatClockTime } from "@manent/ui";
import type { Message } from "@manent/ui";

export type PrompterSendKind = "send" | "sendPrevious";

export type PrompterSendRefusal =
  | "forbidden"
  | "not_in_rundown"
  | "cannot_send"
  | "deleted"
  | "offline"
  | "other";

export type PrompterSendOutcome =
  | { readonly ok: true; readonly response: PrompterSendResponse }
  | { readonly ok: false; readonly code: PrompterSendRefusal };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const authHeaders = (token: string | null): Record<string, string> =>
  token === null ? {} : { Authorization: `Bearer ${token}` };

function parseSendResponse(body: unknown): PrompterSendResponse | null {
  if (!isRecord(body)) return null;
  const { rowId, storyId, versionId, sentAt, senderUserId } = body;
  if (typeof rowId !== "string" || typeof storyId !== "string") return null;
  if (versionId !== null && typeof versionId !== "string") return null;
  if (typeof sentAt !== "number" || !Number.isSafeInteger(sentAt)) return null;
  if (senderUserId !== null && typeof senderUserId !== "string") return null;
  return { rowId, storyId, versionId, sentAt, senderUserId };
}

function refusalFromError(body: unknown, status: number): PrompterSendRefusal {
  const code = isRecord(body) ? body.error : null;
  if (code === "forbidden" || status === 403) return "forbidden";
  if (code === "not_in_rundown" || status === 404) return "not_in_rundown";
  if (code === "cannot_send" || status === 409) return "cannot_send";
  if (code === "deleted" || status === 410) return "deleted";
  return "other";
}

/** Asks `/api/docs/describe` whether the signed-in person holds `send_to_prompter` on `docId`; null when unreachable. */
export async function fetchCanSendPrompter(
  docId: string,
  token: string | null,
): Promise<boolean | null> {
  const answer = await fetch("/api/docs/describe", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ docId }),
  }).catch(() => null);
  if (answer === null || answer.status !== 200) return null;
  const body: unknown = await answer.json().catch(() => null);
  if (!isRecord(body) || !Array.isArray(body.capabilities)) return null;
  return body.capabilities.includes("send_to_prompter");
}

/** Posts `/api/prompter/send` or `/api/prompter/send-previous` with an idempotent request key. */
export async function postPrompterSend(
  kind: PrompterSendKind,
  request: PrompterSendRequest,
  token: string | null,
): Promise<PrompterSendOutcome> {
  const path =
    kind === "send" ? "/api/prompter/send" : "/api/prompter/send-previous";
  const answer = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(request),
  }).catch(() => null);
  if (answer === null) return { ok: false, code: "other" };
  const body: unknown = await answer.json().catch(() => null);
  if (answer.status !== 200)
    return { ok: false, code: refusalFromError(body, answer.status) };
  const parsed = parseSendResponse(body);
  return parsed === null
    ? { ok: false, code: "other" }
    : { ok: true, response: parsed };
}

/** Reads `createdAt` of `versionId` on `storyId` from `/api/versions`, or null when unavailable. */
export async function lookupVersionCreatedAt(
  storyId: string,
  versionId: string,
  token: string | null,
): Promise<number | null> {
  const answer = await fetch(
    `/api/versions?docId=${encodeURIComponent(storyId)}`,
    { headers: authHeaders(token) },
  ).catch(() => null);
  if (answer === null || answer.status !== 200) return null;
  const body: unknown = await answer.json().catch(() => null);
  if (!isRecord(body) || !Array.isArray(body.versions)) return null;
  for (const item of body.versions) {
    if (
      isRecord(item) &&
      item.id === versionId &&
      typeof item.createdAt === "number" &&
      Number.isSafeInteger(item.createdAt)
    ) {
      return item.createdAt;
    }
  }
  return null;
}

/** Parses `CONTROL sent_to_prompter` JSON bytes; null for malformed payloads. */
export function parseSentControl(
  bytes: Uint8Array,
): PrompterSendResponse | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parseSendResponse(parsed);
  } catch {
    // malformed control frame is ignored
    return null;
  }
}

export function prompterSendMessage(
  id: string,
  title: string,
  sentAt: number,
): Message {
  return {
    id,
    text: PROMPTER_WORDS.sent(title, formatClockTime(sentAt)),
    actions: [
      {
        label: PROMPTER_WORDS.sendPrevious,
        commandId: "prompter.sendPrevious",
      },
    ],
    lifetime: "reverse",
    ownWork: false,
  };
}

export function prompterSendPreviousMessage(
  id: string,
  title: string,
  sentAt: number,
  firstSentAt: number | null,
): Message {
  const nowText = formatClockTime(sentAt);
  const text =
    firstSentAt !== null
      ? PROMPTER_WORDS.sentPrevious(
          title,
          nowText,
          formatClockTime(firstSentAt),
        )
      : PROMPTER_WORDS.sent(title, nowText);
  return {
    id,
    text,
    actions: [
      {
        label: PROMPTER_WORDS.sendPrevious,
        commandId: "prompter.sendPrevious",
      },
      { label: PROMPTER_WORDS.sendToPrompter, commandId: "prompter.send" },
    ],
    lifetime: "reverse",
    ownWork: false,
  };
}

export function prompterRefusalMessage(
  id: string,
  kind: PrompterSendKind,
  code: PrompterSendRefusal,
  title: string,
): Message {
  switch (code) {
    case "forbidden":
      return {
        id,
        text: PROMPTER_WORDS.refusedForbidden(title),
        actions: [],
        lifetime: "brief",
        ownWork: false,
      };
    case "not_in_rundown":
      return {
        id,
        text: PROMPTER_WORDS.refusedNotInRundown(title),
        actions: [],
        lifetime: "brief",
        ownWork: false,
      };
    case "cannot_send":
      return {
        id,
        text:
          kind === "send"
            ? PROMPTER_WORDS.refusedNoScript(title)
            : PROMPTER_WORDS.refusedNoPrevious(title),
        actions: [],
        lifetime: "brief",
        ownWork: false,
      };
    case "deleted":
      return {
        id,
        text: PROMPTER_WORDS.refusedDeleted(title),
        actions: [],
        lifetime: "brief",
        ownWork: false,
      };
    case "offline":
      return {
        id,
        text: PROMPTER_WORDS.refusedOffline(title),
        actions: [],
        lifetime: "brief",
        ownWork: false,
      };
    case "other":
      return {
        id,
        text: PROMPTER_WORDS.refusedOther(title),
        actions: [
          {
            label: PROMPTER_WORDS.tryAgain,
            commandId:
              kind === "send" ? "prompter.send" : "prompter.sendPrevious",
          },
        ],
        lifetime: "brief",
        ownWork: false,
      };
  }
}
