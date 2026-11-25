// Prompter subscriptions: added by the prompter's subscribe handler, removed by the service.
import type { Peer } from "./ports.ts";

/** The peers that hold each document as a prompter. */
export interface PrompterSubscribers {
  add(docId: string, peer: Peer): void;
  peersOf(docId: string): readonly Peer[];
  /** The peer unsubscribed from the document. */
  remove(docId: string, peer: Peer): void;
  /** The peer disconnected: it is forgotten for every document. */
  removePeer(peer: Peer): void;
}

export function createPrompterSubscribers(): PrompterSubscribers {
  const byDoc = new Map<string, Set<Peer>>();
  const remove = (docId: string, peer: Peer): void => {
    const peers = byDoc.get(docId);
    peers?.delete(peer);
    if (peers?.size === 0) byDoc.delete(docId);
  };
  return {
    add(docId, peer) {
      byDoc.set(docId, (byDoc.get(docId) ?? new Set()).add(peer));
    },
    peersOf: (docId) => [...(byDoc.get(docId) ?? [])],
    remove,
    removePeer(peer) {
      for (const docId of byDoc.keys()) remove(docId, peer);
    },
  };
}
