// What the revisions feature of the editor reads of production, through a port the host implements.
import type { LockAnchorRecord } from "@manent/pagination";
import type {
  Baseline,
  MarkMode,
  NumberingScheme,
  RevisionColour,
  RevisionSource,
} from "@manent/revisions";

export interface ProductionPort {
  /** Null while the script is not in production. */
  view(): ProductionView | null;
  subscribe(listener: () => void): () => void;
  /** The script's shared map of manual marks; a null value removes the key. */
  overrides: {
    get(key: string): unknown;
    set(key: string, value: string | null): void;
    subscribe(listener: (keys: readonly string[]) => void): () => void;
  };
}

export interface ProductionView {
  readonly setId: string;
  readonly records: readonly LockAnchorRecord[];
  readonly numbering: NumberingScheme;
  readonly issuedNumbers: ReadonlyMap<string, string>;
  readonly used: ReadonlySet<string>;
  readonly baseline: Baseline;
  /** The issued revisions, oldest first, each with its marks as issued. */
  readonly earlier: readonly RevisionSource[];
  readonly active: Omit<RevisionSource, "marks">;
  readonly mode: MarkMode;
  readonly tint: boolean;
  readonly words: {
    lockTooltip(next: string): string;
    colourName(c: RevisionColour): string;
  };
}
