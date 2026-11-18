// The sync socket: single-use tickets, and the seam a transport drives.
export { createTicketStore } from "./tickets.ts";
export type { TicketStore } from "./tickets.ts";
export type {
  Connection,
  ConnectionData,
  ConnectionHandler,
} from "./connection.ts";
