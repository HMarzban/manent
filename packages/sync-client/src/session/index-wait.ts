// A never-synced script created in a workspace subscribes only once the store holds that
// workspace's index with a generation the server named.
import { indexDocId } from "@manent/sync-protocol";
import type { Message } from "@manent/sync-protocol";
import type { ServerGate } from "../link/gate.ts";
import { StoreError } from "../ports/ports.ts";
import type { DocMeta, LocalStore } from "../ports/ports.ts";

type Connect = (send: (message: Message) => void, gate: ServerGate) => void;

interface IndexWaitOptions {
  store: LocalStore;
  meta(): DocMeta;
  /** The subscription's own `connected`. */
  connect: Connect;
}

/** A connection is passed on at once, or held until the index it waits for is stored. */
export class IndexWait {
  private held: {
    send: (message: Message) => void;
    gate: ServerGate;
    indexId: string;
  } | null = null;

  constructor(private readonly options: IndexWaitOptions) {}

  connected(send: (message: Message) => void, gate: ServerGate): void {
    const indexId = this.awaitedIndex();
    if (indexId === null) return this.options.connect(send, gate);
    this.held = { send, gate, indexId };
    void this.connectOnceIndexed();
  }

  /** Another document's meta changed: a connection waiting for that document asks again. */
  metaChanged(docId: string): void {
    if (docId === this.held?.indexId) void this.connectOnceIndexed();
  }

  /** The connection held, if any, is gone. */
  drop(): void {
    this.held = null;
  }

  /** The workspace index a never-synced script's creation waits for; null when nothing waits. */
  private awaitedIndex(): string | null {
    const { neverSynced, create } = this.options.meta();
    const workspaceId = create?.workspaceId ?? null;
    if (!neverSynced || workspaceId === null) return null;
    return indexDocId("workspace", workspaceId);
  }

  /** The server has named a generation for the index once the store holds one above 0. */
  private async connectOnceIndexed(): Promise<void> {
    const { held } = this;
    if (held === null) return;
    const stored = await this.options.store
      .load(held.indexId)
      .catch((error: unknown) => {
        // an index the store cannot read is not there yet: the next connection asks again
        if (!(error instanceof StoreError)) throw error;
        return null;
      });
    if (this.held !== held || (stored?.meta.generation ?? 0) === 0) return;
    this.held = null;
    this.options.connect(held.send, held.gate);
  }
}
