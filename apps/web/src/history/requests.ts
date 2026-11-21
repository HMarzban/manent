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

/**
 * The body of a success from this build's own server: the shared contract fixes its shape, so it is trusted. Throws
 * when the body is not JSON.
 */
export async function readAs<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  return body as T;
}

/** As `readAs`, with the body's length in bytes. */
export async function readSized<T>(
  response: Response,
): Promise<{ value: T; bytes: number }> {
  const body = await response.arrayBuffer();
  const value: unknown = JSON.parse(new TextDecoder().decode(body));
  return { value: value as T, bytes: body.byteLength };
}
