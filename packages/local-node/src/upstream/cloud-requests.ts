// How the node asks the cloud over HTTP: one call with its bearer and JSON body, and what the answer holds.
import { ConnectError } from "@manent/sync-client";
import { isHttpErrorCode } from "@manent/sync-protocol";
import type { HttpErrorCode } from "@manent/sync-protocol";

export type Fields = Record<string, unknown>;

export function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const CLOUD_REQUEST_TIMEOUT_MS = 10_000;

/** Runs `fetch` with a bounded timeout so blackholed networks fail fast as ConnectError("unreachable"). */
export async function fetchWithTimeout(
  fetch: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  timeoutMs = CLOUD_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (cause) {
    throw new ConnectError("unreachable", { cause });
  } finally {
    clearTimeout(timer);
  }
}

/** A thrown or timed-out fetch is ConnectError("unreachable"); `token` null sends no bearer, `body` undefined no body. */
export async function call(
  fetch: typeof globalThis.fetch,
  url: string,
  options: {
    method: "GET" | "POST";
    token: string | null;
    body?: unknown;
    timeoutMs?: number;
  },
): Promise<Response> {
  const { method, token, body, timeoutMs } = options;
  const headers: Record<string, string> = {};
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const sent = body === undefined ? undefined : JSON.stringify(body);
  return fetchWithTimeout(
    fetch,
    url,
    { method, headers, body: sent },
    timeoutMs,
  );
}

/** A body that is not JSON is ConnectError("unreachable"). */
export async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new ConnectError("unreachable", { cause });
  }
}

/** The error code an answer's body names; null when it names none this build knows. */
export function errorCodeOf(body: unknown): HttpErrorCode | null {
  const code = isFields(body) ? body.error : null;
  return isHttpErrorCode(code) ? code : null;
}
