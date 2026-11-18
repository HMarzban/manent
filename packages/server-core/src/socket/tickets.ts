// Single-use tickets that let a signed-in person open the sync socket.
import { randomBytes } from "node:crypto";

export interface TicketStore {
  /** A fresh ticket for `userId`: 32 random bytes in base64url. */
  issue(userId: string): string;
  /** The ticket's user, once; null for a ticket that is unknown, used or expired. */
  redeem(ticket: string): { userId: string } | null;
}

const TICKET_BYTES = 32;

/** How long a ticket can be redeemed unless the store is given another `ttlMs`. */
export const TICKET_TTL_MS = 30_000;

/** Tickets held in memory, each redeemable once within `ttlMs` (default TICKET_TTL_MS) of its issue. */
export function createTicketStore(options: {
  now: () => number;
  ttlMs?: number;
}): TicketStore {
  const { now } = options;
  const ttlMs = options.ttlMs ?? TICKET_TTL_MS;
  // in issue order, so the oldest, first to expire, are at the front
  const issued = new Map<string, { userId: string; expiresAt: number }>();

  const dropExpired = (at: number): void => {
    for (const [ticket, { expiresAt }] of issued) {
      if (expiresAt >= at) return;
      issued.delete(ticket);
    }
  };

  return {
    issue(userId) {
      const at = now();
      dropExpired(at);
      const ticket = randomBytes(TICKET_BYTES).toString("base64url");
      issued.set(ticket, { userId, expiresAt: at + ttlMs });
      return ticket;
    },
    redeem(ticket) {
      const entry = issued.get(ticket);
      if (entry === undefined) return null;
      issued.delete(ticket);
      return entry.expiresAt >= now() ? { userId: entry.userId } : null;
    },
  };
}
