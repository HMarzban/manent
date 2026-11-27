// The launch guard: only the app's own window, which was opened with the launch token, reaches the node.
import { createHash, timingSafeEqual } from "node:crypto";
import type { ManentServer } from "@manent/server-core";
import type { ErrorResponse } from "@manent/sync-protocol";

const COOKIE = "manent_launch";
const HEADER = "x-manent-launch";
const PARAM = "launch";
const FIRST_HEAD = new RegExp("<head\\b[^>]*>", "i");
const SCRIPT_SRC = new RegExp("^script-src(?:\\s|$)", "i");

const encoder = new TextEncoder();

/** Equal in constant time once the lengths match; a length that differs is refused before any comparison. */
function isToken(given: string | null, token: Uint8Array): boolean {
  if (given === null) return false;
  const bytes = encoder.encode(given);
  return bytes.length === token.length && timingSafeEqual(bytes, token);
}

function cookieOf(request: Request, name: string): string | null {
  for (const pair of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = pair.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

const forbidden = (): Response =>
  Response.json({ error: "forbidden" } satisfies ErrorResponse, {
    status: 403,
  });

/** Sends the window on to the same address without the token, holding it in a cookie from now on. */
function admit(url: URL, token: string): Response {
  url.searchParams.delete(PARAM);
  return new Response(null, {
    status: 302,
    headers: {
      location: `${url.pathname}${url.search}`,
      "set-cookie": `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`,
    },
  });
}

function scriptHash(script: string): string {
  return `sha256-${createHash("sha256").update(script).digest("base64")}`;
}

function appendScriptHash(csp: string, hash: string): string {
  const token = `'${hash}'`;
  let found = false;
  const directives = csp.split(";").map((part) => {
    const trimmed = part.trim();
    if (!SCRIPT_SRC.test(trimmed)) return part;
    found = true;
    return trimmed.includes(token) ? part : `${part} ${token}`;
  });
  return found ? directives.join(";") : csp;
}

/** The page with `script` inserted right after its first `<head>` tag; a page without one is unchanged. */
async function withScript(
  response: Response,
  script: string,
  isHead: boolean,
): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("etag");
  headers.set("cache-control", "no-store");
  if (isHead || response.status === 304) {
    const csp = headers.get("content-security-policy");
    if (csp !== null)
      headers.set(
        "content-security-policy",
        appendScriptHash(csp, scriptHash(script)),
      );
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  const page = await response.text();
  const head = FIRST_HEAD.exec(page);
  const end = head === null ? -1 : head.index + head[0].length;
  const body =
    end === -1
      ? page
      : `${page.slice(0, end)}<script>${script}</script>${page.slice(end)}`;
  if (end !== -1) {
    const csp = headers.get("content-security-policy");
    if (csp !== null)
      headers.set(
        "content-security-policy",
        appendScriptHash(csp, scriptHash(script)),
      );
  }
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * The node's server behind the launch token. A request with `?launch=` is answered 302 with the cookie, or 403
 * for a wrong token; `GET /health` passes as it is; `/sw.js` is answered 404 (desktop never uses a service
 * worker); anything else needs the cookie or the `X-Manent-Launch` header, the socket upgrade included, or is
 * answered 403. With `bootScript`, every `text/html` answer that passed carries its script first.
 */
export function createLaunchGuard(options: {
  token: string;
  inner: ManentServer;
  bootScript: (() => string) | null;
}): ManentServer {
  const { token, inner, bootScript } = options;
  const expected = encoder.encode(token);
  return {
    connections: inner.connections,
    sync: inner.sync,
    async fetch(request, context) {
      const url = new URL(request.url);
      const launch = url.searchParams.get(PARAM);
      if (launch !== null)
        return isToken(launch, expected) ? admit(url, token) : forbidden();
      const health = request.method === "GET" && url.pathname === "/health";
      if (
        !health &&
        !isToken(cookieOf(request, COOKIE), expected) &&
        !isToken(request.headers.get(HEADER), expected)
      )
        return forbidden();
      if (url.pathname === "/sw.js")
        return new Response(request.method === "HEAD" ? null : "Not found", {
          status: 404,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      const response = await inner.fetch(request, context);
      if (response === null || bootScript === null) return response;
      const type = response.headers.get("content-type") ?? "";
      return type.startsWith("text/html")
        ? withScript(response, bootScript(), request.method === "HEAD")
        : response;
    },
  };
}
