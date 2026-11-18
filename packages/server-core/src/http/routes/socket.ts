// The routes that open the sync socket: a ticket for a signed-in person, then the upgrade.
import type { WsTicketResponse } from "@manent/sync-protocol";
import { createConnectionData } from "../../socket/handler.ts";
import { TICKET_TTL_MS } from "../../socket/tickets.ts";
import { failure, json } from "../respond.ts";
import type { Route } from "../route.ts";

export const SOCKET_ROUTES: readonly Route[] = [
  {
    method: "POST",
    path: "/api/ws-ticket",
    handle({ config, user }) {
      const identity = user();
      if (identity === null) return failure("unauthenticated", 401);
      return json<WsTicketResponse>({
        ticket: config.socket.tickets.issue(identity.userId),
        expiresInMs: TICKET_TTL_MS,
      });
    },
  },
  {
    method: "GET",
    path: "/ws",
    handle({ config, peer, request }) {
      // a page on another site may open a socket to this machine, so the origin is checked before the upgrade
      const origin = request.headers.get("origin");
      if (origin === null || !config.socket.allowedOrigins.includes(origin))
        return failure("forbidden_origin", 403);
      const ticket = new URL(request.url).searchParams.get("ticket");
      return peer.upgrade(createConnectionData(ticket))
        ? null
        : failure("bad_request", 400);
    },
  },
];
