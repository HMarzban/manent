// REST requests for the reader frame: opening a sent draft link and fetching an earlier sent draft to compare.
import { isVersionContent } from "@manent/sync-client";
import type {
  DraftOpenResponse,
  DraftSinceResponse,
} from "@manent/sync-protocol";
import { readBody } from "../history/requests.ts";

/** `refused` is any other answer, or a body this build cannot read; `unreachable` the request never reached the server. */
export type DraftRequestFailure =
  | "bad_request"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "not_sent"
  | "deleted"
  | "link_expired"
  | "link_revoked"
  | "unreachable"
  | "refused";

export type DraftAnswer<T> =
  { ok: true; value: T } | { ok: false; code: DraftRequestFailure };

export interface ReaderRequests {
  open(linkToken: string): Promise<DraftAnswer<DraftOpenResponse>>;
  since(
    linkToken: string,
    versionId: string,
  ): Promise<DraftAnswer<DraftSinceResponse>>;
}

const FAILURES: readonly DraftRequestFailure[] = Object.freeze([
  "bad_request",
  "unauthenticated",
  "forbidden",
  "not_found",
  "not_sent",
  "deleted",
  "link_expired",
  "link_revoked",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isStringOrNull = (value: unknown): value is string | null =>
  value === null || isString(value);

const isInstant = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

export function isDraftOpenResponse(
  value: unknown,
): value is DraftOpenResponse {
  return (
    isRecord(value) &&
    isString(value.docId) &&
    isString(value.sendId) &&
    isString(value.versionId) &&
    isString(value.name) &&
    isInstant(value.sentAt) &&
    isVersionContent(value.content) &&
    isStringOrNull(value.watermark) &&
    typeof value.canComment === "boolean" &&
    isStringOrNull(value.lastReadVersionId)
  );
}

function isDraftSinceResponse(value: unknown): value is DraftSinceResponse {
  return (
    isRecord(value) &&
    isString(value.versionId) &&
    (value.name === undefined || isString(value.name)) &&
    isVersionContent(value.content)
  );
}

async function failureOf(response: Response): Promise<DraftRequestFailure> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // no body, or not JSON: nothing names the refusal
    return "refused";
  }
  const code = isRecord(body) ? body.error : null;
  return FAILURES.find((failure) => failure === code) ?? "refused";
}

async function request<T>(
  run: () => Promise<Response>,
  is: (value: unknown) => value is T,
): Promise<DraftAnswer<T>> {
  let response: Response;
  try {
    response = await run();
  } catch {
    // the request never reached the server
    return { ok: false, code: "unreachable" };
  }
  if (!response.ok) return { ok: false, code: await failureOf(response) };
  const read = await readBody(response, is);
  return read === null
    ? { ok: false, code: "refused" }
    : { ok: true, value: read.value };
}

export function createReaderRequests(options: {
  fetch: typeof fetch;
  token: () => string | null;
}): ReaderRequests {
  // called as a plain function: a browser's fetch refuses another `this`
  const fetchFn = options.fetch;
  const authHeaders = (): Record<string, string> => {
    const bearer = options.token();
    return bearer === null ? {} : { Authorization: `Bearer ${bearer}` };
  };

  return {
    open: (linkToken) =>
      request(
        () =>
          fetchFn("/api/drafts/open", {
            method: "POST",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ token: linkToken }),
          }),
        isDraftOpenResponse,
      ),
    since: (linkToken, versionId) => {
      const query = new URLSearchParams({ token: linkToken, since: versionId });
      return request(
        () =>
          fetchFn(`/api/drafts/since?${query.toString()}`, {
            headers: authHeaders(),
          }),
        isDraftSinceResponse,
      );
    },
  };
}
