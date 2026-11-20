// The node's records: its signing key, the people chosen on this device, the documents it relays, and their hand-offs.
import type { HandoffRefusal, RecoveredItem } from "@manent/sync-client";

/** `handing_off`: the first sync has a key and a snapshot and has not been answered. `synced`: the server holds it. */
export type NodeDocState = "handing_off" | "synced";

export interface Handoff {
  docId: string;
  key: string;
  kind: string;
  home: string;
  workspaceId: string | null;
  snapshot: Uint8Array;
  startedAt: number;
  refused: HandoffRefusal | null;
}

export interface Person {
  userId: string;
  name: string;
  wantsCloud: boolean;
  cloudToken: string | null;
  chosenAt: number;
}

export interface NodeRecords {
  /** 32 bytes, made once. */
  secret(): Uint8Array;
  person(userId: string): Person | null;
  savePerson(person: Person): void;
  people(): Person[];
  current(): { userId: string; nodeToken: string } | null;
  setCurrent(userId: string, nodeToken: string): void;
  docState(
    docId: string,
  ): { userId: string; state: NodeDocState; generation: number } | null;
  setDocState(
    docId: string,
    userId: string,
    state: NodeDocState,
    generation: number,
  ): void;
  /** Back to the node's own authority (a refused hand-off). */
  removeDoc(docId: string): void;
  docsOf(userId: string): { docId: string; state: NodeDocState }[];
  /** Text a follow of the server's document could not place: its overlaps and set-aside text. */
  addRecovered(
    docId: string,
    userId: string,
    items: readonly RecoveredItem[],
  ): void;
  recovered(docId: string): RecoveredItem[];
  /** The workspace a window named when it made the document on this device, kept until its hand-off starts. */
  setWorkspace(docId: string, workspaceId: string): void;
  /** Null when no window named one, or once the hand-off holds it. */
  workspaceOf(docId: string): string | null;
  handoff(docId: string): Handoff | null;
  /** An existing one is kept: a retry reuses its key and snapshot. A new one takes over the workspace, in one transaction. */
  startHandoff(handoff: Handoff): void;
  /** Keeps the row with its reason and removes the docs row, in one transaction. */
  refuseHandoff(docId: string, reason: HandoffRefusal): void;
  /** Removes the row and sets state "synced" with the server's generation, in one transaction. */
  finishHandoff(docId: string, generation: number): void;
  seedId(): string | null;
  setSeedId(seedId: string | null): void;
  close(): void;
}
