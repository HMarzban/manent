// A version kept inside the caller's transaction: its row, its snapshot and its summary.
import type { DocFile, VersionRow } from "@manent/storage";
import type { VersionContent } from "@manent/sync-protocol";
import { contentAt } from "./content.ts";
import type { LocksAt } from "./content.ts";
import type { HistoryExtras, HistoryService } from "./service.ts";
import type { Recorder } from "./summaries.ts";

export function createKeep(options: {
  recorder: Recorder;
  locksAt: LocksAt;
  extras?: HistoryExtras;
}): HistoryService["keep"] {
  const { recorder, locksAt } = options;
  return (file: DocFile, version: VersionRow, content?: VersionContent) => {
    const { docId } = version;
    const row = file.log.get(docId);
    if (row === null) throw new RangeError(`no document ${docId} here`);
    const head = { generation: row.generation, seq: row.headSeq };
    const base = content ?? contentAt(file, docId, head);
    if (base === null) throw new RangeError(`no head of ${docId} to keep`);
    const locks =
      options.extras === undefined ? base.locks : locksAt(file, docId, head);
    const how = { carry: content === undefined, snapshot: true, key: null };
    const previous = recorder.previousOf(file, docId);
    recorder.forget(docId);
    recorder.record(file, version, { ...base, locks }, how, previous);
  };
}
