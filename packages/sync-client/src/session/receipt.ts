// The receipt a reconnect owes: what it sent, told once nothing waits, with what it filed counted by cause.
import type { LocalCopy } from "./local-copy.ts";

export class Receipt {
  /** The changes waiting at step 2, and how many items were filed before it; null when no receipt is owed. */
  private owed: { sent: number; setAside: number } | null = null;

  owe(sent: number, setAside: number): void {
    this.owed = { sent, setAside };
  }

  /** The reconnect ended in a move: nothing is told for it. */
  drop(): void {
    this.owed = null;
  }

  /** Emits the receipt owed, if any, counting the items filed since its step 2. */
  tell(copy: LocalCopy): void {
    if (this.owed === null) return;
    const { sent, setAside } = this.owed;
    this.owed = null;
    const filed = copy.recovered.slice(setAside);
    const overlaps = filed.filter((item) => item.cause === "overlap").length;
    const unplaced = filed.length - overlaps;
    copy.emit({ type: "receipt", sent, setAside: unplaced, overlaps });
  }
}
