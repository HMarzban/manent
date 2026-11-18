// The one bridge from the sync service to a socket: a peer that frames what it is sent.
import { CODE, createFrameEncoder } from "@manent/sync-protocol";
import type { Identity, MessageIds, VersionSet } from "@manent/sync-protocol";
import type { Connection } from "../socket/connection.ts";
import type { Peer, SyncLimits } from "./ports.ts";

/**
 * A peer over `connection`, framing under the connection's own message IDs. A frame the transport
 * dropped, or more than `limits.backpressureBytes` waiting after a send, closes the connection with
 * 4429 `slow_reader`: a reader dropped this way subscribes again and misses nothing.
 */
export function peerOf(
  connection: Connection,
  session: {
    identity: Identity;
    deviceId: string;
    versions: VersionSet;
    address: string;
  },
  ids: MessageIds,
  limits: SyncLimits,
): Peer {
  const encoder = createFrameEncoder({ ids });
  let closed = false;
  const close = (code: number, reason: string): void => {
    if (closed) return;
    closed = true;
    connection.close(code, reason);
  };
  return {
    userId: session.identity.userId,
    name: session.identity.name,
    deviceId: session.deviceId,
    versions: session.versions,
    address: session.address,
    send(message) {
      if (closed) return;
      for (const frame of encoder.encode(message))
        if (connection.send(frame) === "dropped")
          return close(CODE.RATE_LIMITED, "slow_reader");
      if (connection.bufferedBytes > limits.backpressureBytes)
        close(CODE.RATE_LIMITED, "slow_reader");
    },
    close,
  };
}
