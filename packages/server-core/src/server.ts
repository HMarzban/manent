import { isLoopbackAddress } from "./bind.ts";
import type { SessionStore } from "./sessions.ts";
import type { SignInProvider } from "./sign-in.ts";
import { serveStatic } from "./static.ts";

declare const connectionBrand: unique symbol;

/** What a socket carries. Opaque outside this package. */
export interface ConnectionData {
  readonly [connectionBrand]: true;
}

export interface ServerConfig {
  /** Null when the server is not in demo mode. */
  demo: {
    seedId(): string | null;
    control: { url: string; token: string } | null;
  } | null;
  signIn: SignInProvider;
  sessions: SessionStore;
  /** Exact `host:port` values this server answers to, e.g. `localhost:4747`. */
  allowedHosts: readonly string[];
  /** Origins of the app itself, e.g. `http://localhost:4747`. */
  allowedOrigins: readonly string[];
  /** The address named to a visitor who used another host. */
  openUrl: string;
  /** The built web app; null or a missing directory serves the API only. */
  webDir: string | null;
}

/** Handlers an app passes to `Bun.serve`; this package never listens itself. */
export interface ManentServer {
  fetch(
    request: Request,
    server: Bun.Server<ConnectionData>,
  ): Promise<Response | undefined>;
  websocket: Bun.WebSocketHandler<ConnectionData>;
  dispose(): void;
}

const BEARER = /^Bearer +(\S+)$/i;

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status });
const failure = (code: string, status: number): Response =>
  json({ error: code }, status);

async function readJson(request: Request): Promise<unknown> {
  try {
    return JSON.parse(await request.text()) as unknown;
  } catch {
    return undefined;
  }
}

function isSignInBody(body: unknown): body is { personId: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    typeof (body as { personId?: unknown }).personId === "string"
  );
}

export function createServer(config: ServerConfig): ManentServer {
  const allowedHosts = new Set(config.allowedHosts);

  const identify = (request: Request) => {
    const match = BEARER.exec(request.headers.get("authorization") ?? "");
    const session = match?.[1] ? config.sessions.resolve(match[1]) : null;
    return session ? config.signIn.lookup(session.userId) : null;
  };

  async function api(
    request: Request,
    route: string,
    server: Bun.Server<ConnectionData>,
  ): Promise<Response> {
    if (route === "GET /api/demo") {
      if (!config.demo) return failure("not_found", 404);
      const address = server.requestIP(request)?.address ?? "";
      return json({
        demo: true,
        seedId: config.demo.seedId(),
        control: isLoopbackAddress(address) ? config.demo.control : null,
      });
    }
    if (route === "GET /api/sign-in") return json(config.signIn.describe());
    if (route === "POST /api/sign-in") {
      const body = await readJson(request);
      if (!isSignInBody(body)) return failure("bad_request", 400);
      const person = await config.signIn.authenticate(body);
      if (!person) return failure("unknown_person", 404);
      return json({ session: config.sessions.issue(person.userId), person });
    }
    if (route === "GET /api/me") {
      const person = identify(request);
      if (!person) return failure("unauthenticated", 401);
      return json({
        ...person,
        workspaces: config.signIn.workspaces(person.userId),
      });
    }
    return failure("not_found", 404);
  }

  return {
    async fetch(request, server) {
      const url = new URL(request.url);
      const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
      if (!allowedHosts.has(url.host)) {
        if (isApi) return failure("forbidden_host", 403);
        return new Response(`Open Manent at ${config.openUrl}.`, {
          status: 403,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      const route = `${request.method} ${url.pathname}`;
      if (route === "GET /health") return json({ ok: true });
      if (isApi) return api(request, route, server);
      if (request.method !== "GET" || config.webDir === null)
        return failure("not_found", 404);
      return (
        (await serveStatic(config.webDir, url.pathname)) ??
        failure("not_found", 404)
      );
    },
    websocket: {
      open(socket) {
        socket.close();
      },
      message() {},
    },
    dispose() {},
  };
}
