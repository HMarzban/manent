// The documents each peer holds open: every message it sends for one, and its access read again when that changes.
import type { Message } from "@manent/sync-protocol";
import type { PeerState } from "../rebuild/rebuilder.ts";
import { isWriterRole } from "./admission.ts";
import type { AwarenessHub } from "./awareness.ts";
import type { Deletions } from "./deletions.ts";
import { syncError } from "./errors.ts";
import type { Peer, SyncService, WritePath } from "./ports.ts";
import { answerStepOne, docOf, subscribe } from "./subscribe.ts";
import type { SubscribePorts } from "./subscribe.ts";

export interface SubscribedPeers {
  /** Anything else a client sends for a document is ignored. */
  receive(
    peer: Peer,
    state: PeerState,
    message: Extract<Message, { docId: string }>,
  ): void;
  accessChanged: SyncService["accessChanged"];
}

export function createSubscribedPeers(ports: {
  peers: ReadonlyMap<Peer, PeerState>;
  subscribe: SubscribePorts;
  deletions: Deletions;
  writePath: WritePath;
  presence: Pick<AwarenessHub, "accept">;
  /** Counts the awareness updates the hub dropped. */
  awarenessDropped(count: number): void;
}): SubscribedPeers {
  const { peers, deletions, writePath, presence } = ports;
  const { access, rooms, tell, end } = ports.subscribe;
  return {
    receive(peer, state, message) {
      const { type, docId } = message;
      if (type === "SUBSCRIBE")
        return subscribe(ports.subscribe, peer, state, message);
      if (type === "UNSUBSCRIBE") return end(peer, docId);
      if (!["PUSH", "SET", "SYNC", "AWARENESS"].includes(type)) return;
      const held = state.held.get(docId);
      const notSubscribed = () =>
        tell(
          peer,
          syncError("not_subscribed", {
            docId,
            generation: message.generation,
          }),
        );
      if (held === undefined) return notSubscribed();
      const { room, subscription, lastServerSeq } = held;
      if (type === "PUSH") return writePath.push(room, subscription, message);
      if (type === "SET") return writePath.set(room, subscription, message);
      if (subscription.mode !== "edit") return notSubscribed();
      if (type === "AWARENESS")
        ports.awarenessDropped(presence.accept(room, peer, message.update));
      if (type !== "SYNC" || message.step !== "step1") return;
      const step = { vector: message.data, lastServerSeq };
      for (const m of answerStepOne(
        { rooms, deletions, writePath },
        room,
        step,
      ))
        tell(peer, m);
    },
    accessChanged(docId, userId) {
      for (const [peer, state] of peers) {
        const held = state.held.get(docId);
        if (held === undefined || peer.userId !== userId) continue;
        const resolved = access.resolve(userId, docId);
        const reader =
          resolved.ok &&
          !isWriterRole(resolved.access.role) &&
          held.room.kind !== "index";
        if (resolved.ok && !(held.subscription.mode === "edit" && reader)) {
          held.subscription.access = resolved.access;
          continue;
        }
        tell(peer, syncError("forbidden", docOf(held.room)));
        end(peer, docId);
      }
    },
  };
}
