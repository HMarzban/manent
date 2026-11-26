// HTTP requests for remote prompter operator lease and scroll control (`/api/prompter/control`, `/operator/take`, `/operator/release`).
import {
  isPrompterOperator,
  isPrompterScrollState,
} from "@manent/sync-protocol";
import type {
  PrompterControlResponse,
  PrompterOperator,
  PrompterOperatorReleaseRequest,
  PrompterOperatorResponse,
  PrompterOperatorTakeRequest,
  PrompterScrollCommand,
  PrompterScrollState,
} from "@manent/sync-protocol";

export interface PrompterControlStatusSnapshot {
  readonly operator: PrompterOperator | null;
  readonly scroll: PrompterScrollState | null;
  readonly serverTime: number;
}

export type PrompterTakeOutcome =
  | { readonly ok: true; readonly response: PrompterOperatorResponse }
  | {
      readonly ok: false;
      readonly code: "operator_taken";
      readonly operator: PrompterOperator;
      readonly serverTime: number;
    }
  | { readonly ok: false; readonly code: "forbidden" | "other" };

export type PrompterControlCommandOutcome =
  | { readonly ok: true; readonly response: PrompterControlResponse }
  | {
      readonly ok: false;
      readonly code: "forbidden" | "not_operator" | "not_in_rundown" | "other";
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isServerTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const authHeaders = (token: string | null): Record<string, string> =>
  token === null ? {} : { Authorization: `Bearer ${token}` };

async function postControlJson(
  path: string,
  payload: unknown,
  token: string | null,
  fetchFn: typeof fetch,
): Promise<{ readonly status: number; readonly body: unknown } | null> {
  const answer = await fetchFn(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(payload),
  }).catch(() => null);
  if (answer === null) return null;
  return { status: answer.status, body: await answer.json().catch(() => null) };
}

/** Reads current remote operator and scroll anchor from `GET /api/prompter/control?docId=...`. */
export async function fetchPrompterControlStatus(
  docId: string,
  token: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<PrompterControlStatusSnapshot | null> {
  const answer = await fetchFn(
    `/api/prompter/control?docId=${encodeURIComponent(docId)}`,
    { headers: authHeaders(token) },
  ).catch(() => null);
  if (answer === null || answer.status !== 200) return null;
  const body: unknown = await answer.json().catch(() => null);
  if (!isRecord(body) || !isServerTime(body.serverTime)) return null;
  const operator =
    body.operator === null
      ? null
      : isPrompterOperator(body.operator)
        ? body.operator
        : undefined;
  const scroll =
    body.scroll === null
      ? null
      : isPrompterScrollState(body.scroll)
        ? body.scroll
        : undefined;
  return operator === undefined || scroll === undefined
    ? null
    : { operator, scroll, serverTime: body.serverTime };
}

/** Claims or renews the remote prompter operator lease via `POST /api/prompter/operator/take`. */
export async function postPrompterOperatorTake(
  docId: string,
  request: PrompterOperatorTakeRequest,
  token: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<PrompterTakeOutcome> {
  const res = await postControlJson(
    "/api/prompter/operator/take",
    { docId, ...request },
    token,
    fetchFn,
  );
  if (res === null) return { ok: false, code: "other" };
  const { status, body } = res;
  if (status === 403) return { ok: false, code: "forbidden" };
  if (
    status === 409 &&
    isRecord(body) &&
    body.error === "operator_taken" &&
    isPrompterOperator(body.operator) &&
    isServerTime(body.serverTime)
  ) {
    return {
      ok: false,
      code: "operator_taken",
      operator: body.operator,
      serverTime: body.serverTime,
    };
  }
  if (
    status === 200 &&
    isRecord(body) &&
    isServerTime(body.serverTime) &&
    (body.operator === null || isPrompterOperator(body.operator))
  ) {
    return {
      ok: true,
      response: { operator: body.operator, serverTime: body.serverTime },
    };
  }
  return { ok: false, code: "other" };
}

/** Releases this device's operator lease via `POST /api/prompter/operator/release`. */
export async function postPrompterOperatorRelease(
  docId: string,
  request: PrompterOperatorReleaseRequest,
  token: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<PrompterOperatorResponse | null> {
  const res = await postControlJson(
    "/api/prompter/operator/release",
    { docId, ...request },
    token,
    fetchFn,
  );
  if (res === null || res.status !== 200 || !isRecord(res.body)) return null;
  const { operator, serverTime } = res.body;
  if (
    !isServerTime(serverTime) ||
    (operator !== null && !isPrompterOperator(operator))
  )
    return null;
  return { operator, serverTime };
}

/** Sends a remote scroll command (`play`, `pause`, `speed`, `cue`, `nudge`) via `POST /api/prompter/control`. */
export async function postPrompterScrollCommand(
  docId: string,
  command: PrompterScrollCommand,
  token: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<PrompterControlCommandOutcome> {
  const res = await postControlJson(
    "/api/prompter/control",
    { docId, ...command },
    token,
    fetchFn,
  );
  if (res === null) return { ok: false, code: "other" };
  const { status, body } = res;
  if (status === 403) return { ok: false, code: "forbidden" };
  if (status === 404) return { ok: false, code: "not_in_rundown" };
  if (status === 409) return { ok: false, code: "not_operator" };
  if (
    status === 200 &&
    isRecord(body) &&
    isPrompterScrollState(body.scroll) &&
    isPrompterOperator(body.operator) &&
    isServerTime(body.serverTime)
  ) {
    return {
      ok: true,
      response: {
        scroll: body.scroll,
        operator: body.operator,
        serverTime: body.serverTime,
      },
    };
  }
  return { ok: false, code: "other" };
}
