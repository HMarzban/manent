// What a session is opened with: its document, its ports, what it hears from the link and
// what it tells its client.
import type { CrdtDoc } from "@manent/crdt";
import type { LinkIssue } from "../link/machine.ts";
import type {
  DeviceVersion,
  DocMeta,
  LinkState,
  SyncClientPorts,
} from "../ports/ports.ts";
import type { Via } from "../upstream/window.ts";
import type { ViewHandle } from "../view/view.ts";
import type { UnsavedEdit } from "./edits.ts";

/** What a session hears from the link. */
export interface SessionLink {
  state: LinkState;
  issue: LinkIssue;
  wentOfflineAt: number | null;
}

export interface SessionOptions {
  docId: string;
  ports: SyncClientPorts;
  /** `local_node`: the node is the store, Saved its acknowledgement, and Synced and the last sync the upstream's. */
  via: Via;
  /** The tab's own document when it takes the lead, keeping its client ID; null for a new one. */
  doc: CrdtDoc | null;
  /** What the tab's leader never saved, stored first. */
  unsaved: UnsavedEdit[];
  /** Every update stored: the server's, this tab's, another tab's. */
  stored(update: Uint8Array): void;
  /** A reader of the document, for when it may not be edited. */
  view(): ViewHandle;
  /** The store refused a write because another tab now leads. */
  lostLead(): void;
  /** The tabs following this document. */
  followers(): string[];
  /** A new document's request; null to open one that may exist. */
  create: DocMeta["create"];
  link: SessionLink;
  writeSchema: number;
  uploadVersion: ((version: DeviceVersion) => Promise<boolean>) | null;
  replaceConnection(reason: string): void;
  /** This document's meta changed, and every write started so far has settled. */
  metaChanged(): void;
  closed(): void;
}
