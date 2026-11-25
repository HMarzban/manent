// The Import group's body: the record's lines, kept current, drawn as sentences, a title and rows.
import { IMPORT_MAP, IMPORT_RECORD_KEY, jsonMap } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { IMPORT_WORDS, Row } from "@manent/ui";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import { importRows } from "./import-rows.ts";

const NO_ROWS: readonly string[] = Object.freeze([]);

/** The document of the open editor of `docId`; null while none is open. */
function useLiveDoc(docId: string): CrdtDoc | null {
  return useSyncExternalStore(
    subscribeLiveEditors,
    () => liveEditor(docId)?.doc ?? null,
  );
}

/** The group's lines for the document's record, kept current as the record changes; none without a record. */
function useImportRows(doc: CrdtDoc | null): readonly string[] {
  const [rows, setRows] = useState(NO_ROWS);
  useEffect(() => {
    if (doc === null) return undefined;
    const imported = jsonMap(doc, IMPORT_MAP);
    let shown = true;
    const read = (): void => {
      if (imported.get(IMPORT_RECORD_KEY) === null) {
        setRows(NO_ROWS);
        return;
      }
      // most scripts were never imported: formats loads when a record is first found
      void import("@manent/formats").then(({ parseImportRecord }) => {
        if (!shown) return;
        const record = parseImportRecord(imported.get(IMPORT_RECORD_KEY));
        setRows(record === null ? NO_ROWS : importRows(record));
      });
    };
    read();
    const stop = imported.subscribe(read);
    return () => {
      shown = false;
      stop();
      setRows(NO_ROWS);
    };
  }, [doc]);
  return rows;
}

/** The sentences, then, under "Imported, not shown", its line and one row per kept kind; nothing for a script never imported. */
export function ImportGroup(props: { docId: string }): ReactNode {
  const rows = useImportRows(useLiveDoc(props.docId));
  if (rows.length === 0) return null;
  const notShown = rows.indexOf(IMPORT_WORDS.notShownTitle);
  const notBroughtIn = rows.indexOf(IMPORT_WORDS.notBroughtInTitle);
  const apart = notShown >= 0 ? notShown : notBroughtIn;
  const hasLine = notShown >= 0;
  const said = apart < 0 ? rows : rows.slice(0, apart);
  const listStart = hasLine ? apart + 2 : apart + 1;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-meta font-semibold">{IMPORT_WORDS.groupTitle}</h3>
      {said.map((line) => (
        <p key={line} className="text-meta text-fg-muted">
          {line}
        </p>
      ))}
      {apart < 0 ? null : (
        <>
          <h4 className="text-meta font-semibold">{rows[apart]}</h4>
          {hasLine ? (
            <p className="text-meta text-fg-muted">{rows[apart + 1]}</p>
          ) : null}
          <div>
            {rows.slice(listStart).map((label) => (
              <Row key={label}>
                <span className="whitespace-normal">{label}</span>
              </Row>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
