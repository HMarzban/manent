// What a route is, and what it is given.
import type { Identity } from "@manent/sync-protocol";
import type { RequestContext, ServerConfig } from "./server.ts";

export interface RouteContext {
  request: Request;
  peer: RequestContext;
  config: ServerConfig;
  /** The signed-in user the directory still lists; null otherwise. */
  user(): Identity | null;
}

/** Matched on the method and the exact path. */
export interface Route {
  method: "GET" | "POST";
  path: string;
  /** Null: the request was upgraded to a socket. */
  handle(context: RouteContext): Response | null | Promise<Response | null>;
}
