// What the server's refusals mean for a subscription: an ERROR that ends it, and a node's
// refusal of one entry.
import { CODE } from "@manent/sync-protocol";
import type { Message } from "@manent/sync-protocol";
import type { ServerGate } from "../link/gate.ts";

/**
 * Why a subscription ended with no retry of its own. `stopped`: nothing more is
 * sent until the session says so; its side is `server_old` for a 4422 from a
 * server that does not know this build's newest schema.
 */
export type Ending =
  | {
      type: "stopped";
      side: "deleted" | "read_only" | "rejected" | "server_old";
      code: number;
      clientSeq: number | null;
    }
  | { type: "forbidden" }
  | { type: "client_id_taken" }
  | { type: "moved" };

/** The entry a node's `upstream_refused` names; null for data that names none. */
export function readRefusal(
  data: Uint8Array,
): { clientSeq: number; message: string } | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(data));
  } catch {
    // data that is not JSON names no entry, so it refuses nothing
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  if (!("clientSeq" in value) || typeof value.clientSeq !== "number")
    return null;
  if (!("message" in value) || typeof value.message !== "string") return null;
  return { clientSeq: value.clientSeq, message: value.message };
}

/** What an ERROR that ends the subscription means; null: subscribe again after a wait. */
export function endingOf(
  m: Extract<Message, { type: "ERROR" }>,
  gate: ServerGate,
): Ending | null {
  const stopped = (side: Extract<Ending, { type: "stopped" }>["side"]) =>
    ({ type: "stopped", side, code: m.code, clientSeq: m.clientSeq }) as const;
  if (m.code === CODE.BAD_FRAME && m.message === "client_id_taken")
    return { type: "client_id_taken" };
  if (m.code === CODE.DOCUMENT_DELETED) return stopped("deleted");
  if (m.code === CODE.FORBIDDEN) return { type: "forbidden" };
  if (m.code === CODE.TOO_OLD) return stopped("read_only");
  if (!m.permanent) return null;
  return gate === "limited" && m.code === CODE.VALIDATION_FAILED
    ? stopped("server_old")
    : stopped("rejected");
}
