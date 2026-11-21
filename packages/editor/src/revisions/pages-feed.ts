// The rows of the Pages tab, as the editor publishes them.
import type { RevisionColour } from "@manent/revisions";

export interface PageRow {
  readonly index: number;
  readonly label: string;
  readonly locked: boolean;
  readonly level: number;
  /** Null for a page no revision marks. */
  readonly revision: RevisionColour | null;
  readonly revisionName: string | null;
}

export interface PagesSink {
  /** `revisedScenes`: the heading ids of the scenes holding an active mark. */
  publish(rows: readonly PageRow[], revisedScenes: readonly string[]): void;
}
