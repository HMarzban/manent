// The Library row's line while the person has a private copy of the script open: how many scenes it changed.
import { WRITING_WORDS } from "@manent/ui";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { DocumentRowLine } from "../screens/library/document-row-lines.ts";
import { useServices } from "../services/context.tsx";
import { writingActions } from "../state/writing.store.ts";
import { compareCopy } from "./compare-copy.ts";
import { copyEntryOf } from "./writing-index.ts";

/** The person's private copy of `docId` while it is open, kept after they leave Privately; null otherwise. */
function openCopyOf(docId: string): string | null {
  const index = writingActions.index();
  const entry = index === null ? null : copyEntryOf(index, docId);
  return entry === null || entry.handedIn ? null : entry.privateDocId;
}

/** Until the copy has been compared, or while it cannot be, the line names no count. */
function useWritingLine(docId: string): string | null {
  const services = useServices();
  useEffect(() => writingActions.bind(services), [services]);
  const read = () => openCopyOf(docId);
  const copy = useSyncExternalStore(writingActions.subscribe, read, read);
  const [counted, setCounted] = useState<{
    copy: string;
    scenes: number;
  } | null>(null);
  useEffect(() => {
    if (copy === null) return undefined;
    let shown = true;
    void compareCopy(services, docId, copy).then((changes) => {
      if (shown && changes !== null)
        setCounted({ copy, scenes: changes.scenes.length });
    });
    return () => {
      shown = false;
    };
  }, [services, docId, copy]);
  if (copy === null) return null;
  return WRITING_WORDS.rowLine(counted?.copy === copy ? counted.scenes : 0);
}

export const writingRowLine: DocumentRowLine = Object.freeze({
  id: "writing",
  useLine: useWritingLine,
});
