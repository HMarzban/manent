// The production routes over the browser's fetch: JSON sent, JSON or a PDF's bytes answered.
import { ConnectError } from "@manent/sync-client";
import type { ProductionTransport } from "@manent/sync-client";

type Answer = Awaited<ReturnType<ProductionTransport["post"]>>;

/** A PDF as its bytes, anything else as JSON; a body that reads as neither is ConnectError("unreachable"). */
async function readBody(response: Response): Promise<unknown> {
  try {
    const type = response.headers.get("Content-Type") ?? "";
    if (type.startsWith("application/pdf"))
      return new Uint8Array(await response.arrayBuffer());
    return await response.json();
  } catch (cause) {
    throw new ConnectError("unreachable", { cause });
  }
}

/** A thrown fetch is ConnectError("unreachable"); a refused session, ConnectError("sign_in"). */
export function createHttpProductionTransport(options: {
  baseUrl: string;
  token: () => string | null;
  fetch: typeof fetch;
}): ProductionTransport {
  // called unbound: the browser's fetch refuses any other `this`
  const { baseUrl, token, fetch: send } = options;
  async function ask(
    path: string,
    init: { method: string; headers: Record<string, string>; body?: string },
  ): Promise<Answer> {
    const session = token();
    const headers =
      session === null
        ? init.headers
        : { ...init.headers, Authorization: `Bearer ${session}` };
    let response: Response;
    try {
      response = await send(new URL(path, baseUrl), {
        ...init,
        headers,
      });
    } catch (cause) {
      throw new ConnectError("unreachable", { cause });
    }
    if (response.status === 401) throw new ConnectError("sign_in");
    return { status: response.status, body: await readBody(response) };
  }
  return {
    post: (path, body) =>
      ask(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    get: (path) => ask(path, { method: "GET", headers: {} }),
  };
}
