// One open document of a tab, what a tab's documents are made from, and what a leader posts for a session's event.
import type {
  DeviceVersion,
  DocMeta,
  SyncClientPorts,
} from "../ports/ports.ts";
import type { DocEvent } from "../session/doc-handle.ts";
import type { Session } from "../session/session.ts";
import type { TabBody } from "../tabs/messages.ts";
import type { Via } from "../upstream/window.ts";
import type { ViewHandle } from "../view/view.ts";
import type { Follower } from "./follower.ts";
import type { LinkDriver } from "./link-driver.ts";
import type { RelayHandle } from "./relay.ts";

export interface ReplicasOptions {
  ports: SyncClientPorts;
  via: Via;
  link: LinkDriver;
  uploadVersion: ((version: DeviceVersion) => Promise<boolean>) | null;
  leading(): boolean;
  /** A reader of the document, for when it may not be edited. */
  view(docId: string): ViewHandle;
  /** A store write was refused because another tab leads. */
  lostLead(): void;
}

/**
 * One open document of this tab: the handle the app holds, and what is behind
 * it, a session while this tab leads and a follower while another does.
 * `holders`: the tabs that hold it open, this tab's app under its own tab ID;
 * it is closed once none does. `queue` runs a following tab's requests for it
 * one after the other. `clients`: the client ID of each following tab's
 * document, as its last `open` or `opened` named it; `replaced`: each one a
 * recovery replaced, which the tab loads anew (a move's are carried over),
 * with the replacement's generation.
 */
export interface Replica {
  create: DocMeta["create"];
  readonly holders: Set<string>;
  readonly clients: Map<string, number>;
  readonly replaced: Map<number, number>;
  relay: RelayHandle | null;
  follower: Follower | null;
  ready: { promise: Promise<RelayHandle>; resolve(relay: RelayHandle): void };
  unwire: () => void;
  queue: Promise<void>;
}

/** What a leader posts for a session's event: a replacement carries the new state and its generation, Recovered text its items. */
export function eventBody(
  docId: string,
  event: DocEvent,
  session: Session,
): TabBody {
  if (event.type === "replaced") {
    const { state, meta } = session.state();
    return { t: "replace", docId, generation: meta.generation, state };
  }
  if (event.type === "recovered")
    return { t: "recovered", docId, items: event.items };
  return { t: "event", docId, event };
}
