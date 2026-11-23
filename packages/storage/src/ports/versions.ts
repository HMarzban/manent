// A document's versions: their kinds and rows.
export type VersionKind =
  | "auto"
  | "saved"
  | "named"
  | "sent"
  | "export"
  | "device"
  | "pre_restore"
  | "pre_merge"
  | "pre_heal"
  | "recovered"
  | "revision_baseline"
  | "revision_issue"
  | "prompter"
  | "pre_hand_in";

export interface VersionRow {
  id: string;
  docId: string;
  generation: number | null;
  seq: number | null;
  kind: VersionKind;
  name: string | null;
  createdByUserId: string;
  createdAt: number;
  deviceId: string | null;
}

export interface Versions {
  add(version: VersionRow): void;
  /** Newest first. */
  list(docId: string): VersionRow[];
}
