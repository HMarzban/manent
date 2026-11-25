import type { CrdtDoc } from "@manent/crdt";
import type { DocKind } from "@manent/sync-protocol";

export interface SearchExtractor {
  readonly kind: DocKind;
  /** Text visible to anyone with read access (viewer-safe body text). */
  text(doc: CrdtDoc): string;
  /** Optional text visible ONLY to editors and owners (e.g. cuts); never searched for viewers or commenters. */
  editorText?(doc: CrdtDoc): string;
}

export const SEARCH_EXTRACTORS: readonly SearchExtractor[] = [];
