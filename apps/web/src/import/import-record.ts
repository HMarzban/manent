// What an import keeps with the script, and the one line that says what came in.
import type { ImportRecord, ImportedScript } from "@manent/formats";
import { IMPORT_WORDS } from "@manent/ui";

export function importRecordOf(
  script: ImportedScript,
  file: { name: string; sha256: string },
  title: string,
  at: { importedAt: number; userId: string },
  counts: ImportRecord["counts"],
  overflowing: readonly string[],
  lockKey: string | null,
): ImportRecord {
  return {
    v: 1,
    from: script.from,
    title,
    fileName: file.name,
    fileSha256: file.sha256,
    importedAt: at.importedAt,
    importedByUserId: at.userId,
    counts,
    overflowing,
    coloursMapped: script.coloursMapped,
    kept: script.kept,
    unread: script.unread,
    production: script.production,
    lockKey,
  };
}

const CLAUSES: Readonly<Record<ImportRecord["from"], readonly string[]>> =
  Object.freeze({
    fdx: [IMPORT_WORDS.finalDraftClause, IMPORT_WORDS.shortcutsClause],
    fdr: [IMPORT_WORDS.finalDraftClause],
    fountain: [],
    text: [],
    pdf: [],
    docx: [],
    ink: [],
  });

/** The summary of what came in, with the clauses of the file's format; the same in the message and in Details. */
export function summaryOf(record: ImportRecord): string {
  const { pages, scenes, notes } = record.counts;
  return [
    IMPORT_WORDS.summary(record.title, pages, scenes, notes),
    ...CLAUSES[record.from],
  ].join(" ");
}
