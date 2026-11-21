// The server: the host check, the routes, then the web app's files; and the socket's connections.
import type {
  ControlEndpoint,
  Identity,
  ServerVersions,
} from "@manent/sync-protocol";
import type { Directory } from "../auth/directory.ts";
import type { SessionStore } from "../auth/sessions.ts";
import type { SignInProvider } from "../auth/sign-in.ts";
import type { HistoryService } from "../history/service.ts";
import type { ProductionService } from "../production/service.ts";
import type {
  ConnectionData,
  ConnectionHandler,
} from "../socket/connection.ts";
import { createConnectionHandler } from "../socket/handler.ts";
import type { TicketStore } from "../socket/tickets.ts";
import { DEFAULT_LIMITS } from "../sync/ports.ts";
import { createSyncService } from "../sync/service.ts";
import type { SyncService, SyncSettings } from "../sync/ports.ts";
import { failure } from "./respond.ts";
import { hearRemovals } from "./routes/docs.ts";
import { hearReplays } from "./routes/replay.ts";
import { ROUTES } from "./routes/index.ts";
import { serveStatic } from "./static.ts";

export interface RequestContext {
  /** The caller's address as the listener saw it; "" when it cannot tell. */
  remoteAddress: string;
  /** Asks the transport to turn this request into a socket that carries `data`; false when it is not an upgrade. */
  upgrade(data: ConnectionData): boolean;
}

export interface ServerConfig {
  http: {
    /** Exact `host:port` values this server answers to, e.g. `localhost:4747`. */
    allowedHosts: readonly string[];
    /** The address named to a visitor who used another host. */
    openUrl: string;
    /** The built web app; null or a missing directory serves the API only. */
    webDir: string | null;
  };
  auth: {
    signIn: SignInProvider;
    directory: Directory;
    sessions: SessionStore;
  };
  /** Null when the server is not in demo mode. */
  demo: {
    seedId(): string | null;
    control: ControlEndpoint | null;
  } | null;
  socket: {
    tickets: TicketStore;
    versions: ServerVersions;
    /** Origins of the app itself, e.g. `http://localhost:4747`. */
    allowedOrigins: readonly string[];
  };
  /** Null: every document frame is answered 4403, and the document routes answer not_found. */
  sync: SyncSettings | null;
  /** Absent: every history route answers not_found. */
  history?: HistoryService;
  /** Absent: every production route answers not_found. */
  production?: ProductionService;
}

/** What an app hands to its listener; this package never listens itself. */
export interface ManentServer {
  /** Null: the request was upgraded to a socket. */
  fetch(request: Request, context: RequestContext): Promise<Response | null>;
  connections: ConnectionHandler;
  /** Null when the configuration serves no document. */
  readonly sync: SyncService | null;
}

const BEARER = /^Bearer +(\S+)$/i;

function userOf(request: Request, auth: ServerConfig["auth"]): Identity | null {
  const token = BEARER.exec(request.headers.get("authorization") ?? "")?.[1];
  const session = token === undefined ? null : auth.sessions.resolve(token);
  return session === null ? null : auth.directory.user(session.userId);
}

export function createServer(config: ServerConfig): ManentServer {
  const allowedHosts = new Set(config.http.allowedHosts);
  const { webDir } = config.http;
  const { versions } = config.socket;
  const settings = config.sync;
  const sync =
    settings === null
      ? null
      : {
          service: createSyncService({ ...settings, versions }),
          clock: settings.clock,
          limits: { ...DEFAULT_LIMITS, ...settings.limits },
        };
  if (sync !== null) hearRemovals(config, sync.service);
  if (sync !== null) hearReplays(config, sync.service);

  return {
    sync: sync?.service ?? null,
    connections: createConnectionHandler({
      tickets: config.socket.tickets,
      directory: config.auth.directory,
      versions,
      sync,
    }),
    async fetch(request, peer) {
      const url = new URL(request.url);
      const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
      if (!allowedHosts.has(url.host)) {
        if (isApi) return failure("forbidden_host", 403);
        return new Response(`Open Manent at ${config.http.openUrl}.`, {
          status: 403,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      const route = ROUTES.find(
        (r) => r.method === request.method && r.path === url.pathname,
      );
      if (route !== undefined) {
        const user = () => userOf(request, config.auth);
        return route.handle({ request, peer, config, user });
      }
      if (isApi || request.method !== "GET" || webDir === null)
        return failure("not_found", 404);
      return (
        (await serveStatic(webDir, url.pathname)) ?? failure("not_found", 404)
      );
    },
  };
}
