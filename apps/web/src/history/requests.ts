// The history routes as this tab asks them: every request carries the person's token.

export interface HistoryHttp {
  get(path: string, query: Readonly<Record<string, string>>): Promise<Response>;
  /** `body` is sent as JSON. */
  post(path: string, body: unknown): Promise<Response>;
}

export function createHistoryHttp(options: {
  fetch: typeof fetch;
  token: () => string | null;
}): HistoryHttp {
  // called as a plain function: a browser's fetch refuses another `this`
  const fetchFn = options.fetch;
  const bearer = (): Record<string, string> => {
    const token = options.token();
    return token === null ? {} : { Authorization: `Bearer ${token}` };
  };
  return {
    get: (path, query) =>
      fetchFn(`${path}?${new URLSearchParams(query).toString()}`, {
        headers: bearer(),
      }),
    post: (path, body) =>
      fetchFn(path, {
        method: "POST",
        headers: { ...bearer(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  };
}

/** A success's body with its length in bytes; null when the body is not JSON or not of the shape `is` checks. */
export async function readBody<T>(
  response: Response,
  is: (value: unknown) => value is T,
): Promise<{ value: T; bytes: number } | null> {
  const body = await response.arrayBuffer();
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body));
  } catch {
    // a body that is not JSON answers nothing this build can read
    return null;
  }
  return is(value) ? { value, bytes: body.byteLength } : null;
}
