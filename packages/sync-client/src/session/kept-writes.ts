// The entries the store refused to write, kept in memory and written again until it takes them.
import { STORE_RETRY_MS, StoreError } from "../ports/ports.ts";
import type { StoredEntry, SyncClientPorts } from "../ports/ports.ts";

interface KeptWritesOptions {
  docId: string;
  ports: SyncClientPorts;
  /** The journal's entries, by `localSeq`. */
  entries(): readonly StoredEntry[];
  /** How many are kept changed. */
  changed(): void;
  /** A write was refused because another tab now leads. */
  lostLead(): void;
}

function isLostLead(error: unknown): boolean {
  return error instanceof StoreError && error.code === "lost_lead";
}

/**
 * The entries the store refused, by `localSeq`. Each is written again, as the
 * journal holds it then, before the next append and every STORE_RETRY_MS while
 * any is kept; one the journal no longer holds is dropped, as the server has it
 * or refused it.
 */
export class KeptWrites {
  private kept: number[] = [];
  private retrying: Promise<void> | null = null;
  private cancel: (() => void) | null = null;
  private readonly options: KeptWritesOptions;

  constructor(options: KeptWritesOptions) {
    this.options = options;
  }

  get size(): number {
    return this.kept.length;
  }

  /** Settles once the entry is written or kept; rejects what is not a refusal to keep. */
  async append(entry: StoredEntry): Promise<void> {
    if (this.kept.length > 0) await this.retry();
    if (await this.write(entry)) return;
    this.kept = [...this.kept, entry.localSeq].toSorted((a, b) => a - b);
    this.arm();
    this.options.changed();
  }

  /** The kept entries the journal still holds, by `localSeq`. */
  entries(): StoredEntry[] {
    return this.options.entries().filter((e) => this.kept.includes(e.localSeq));
  }

  /** Nothing more is written. */
  stop(): void {
    this.cancel?.();
    this.cancel = null;
    this.kept = [];
  }

  private retry(): Promise<void> {
    this.retrying ??= this.writeKept().finally(() => {
      this.retrying = null;
    });
    return this.retrying;
  }

  private async writeKept(): Promise<void> {
    for (const entry of this.entries())
      if (await this.write(entry))
        this.kept = this.kept.filter((seq) => seq !== entry.localSeq);
    this.kept = this.entries().map((e) => e.localSeq);
    if (this.kept.length > 0) this.arm();
    this.options.changed();
  }

  /** False when the store refused the entry; StoreError("lost_lead") is thrown on. */
  private async write(entry: StoredEntry): Promise<boolean> {
    try {
      await this.options.ports.store.append(this.options.docId, entry);
      return true;
    } catch (error) {
      if (!(error instanceof StoreError) || isLostLead(error)) throw error;
      return false;
    }
  }

  private arm(): void {
    if (this.cancel !== null) return;
    this.cancel = this.options.ports.clock.schedule(() => {
      this.cancel = null;
      void this.retry().catch((error: unknown) => {
        if (!isLostLead(error)) throw error;
        this.options.lostLead();
      });
    }, STORE_RETRY_MS);
  }
}
