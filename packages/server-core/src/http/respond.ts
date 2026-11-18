// The answers a route sends, and the one reader of a request body.
import type { ErrorResponse, HttpErrorCode } from "@manent/sync-protocol";

export function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status });
}

export function failure(code: HttpErrorCode, status: number): Response {
  return json<ErrorResponse>({ error: code }, status);
}

/** The body parsed as JSON; `ok: false` when it is not JSON. */
export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  const text = await request.text();
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}
