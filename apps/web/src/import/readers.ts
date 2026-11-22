// The files Manent imports, one row per extension that reads or refuses them; @manent/formats loads at the first read.
import type { ImportedScript, SourceFormat, XmlParser } from "@manent/formats";
import type { IdSource } from "@manent/schema";
import { FDR_NOT_READABLE } from "@manent/ui";

interface ReaderRow {
  readonly extension: string;
  readonly from: SourceFormat;
}

interface ReadingRow extends ReaderRow {
  /** Loads @manent/formats at its first call; rejects with the reader's FormatError. */
  read(bytes: Uint8Array, ids: IdSource): Promise<ImportedScript>;
}

interface RefusingRow extends ReaderRow {
  /** The sentence that answers a file of this extension, which is never read. */
  refuse(name: string): string;
}

/** A row reads its files or refuses them, never both. */
export type ImportReader = ReadingRow | RefusingRow;

/** A constant, so the picker and the refusals need no module loaded. */
export const IMPORTABLE_EXTENSIONS: readonly string[] = Object.freeze([
  ".fdx",
  ".fountain",
  ".fdr",
]);

/** .fdx → readFdx with parseXml; .fountain → readFountain after decodeText; .fdr is answered with how to bring it in as an .fdx. The app passes domXml; apps/web's unit tests pass bunXml. */
export function importReaders(parseXml: XmlParser): readonly ImportReader[] {
  return [
    {
      extension: ".fdx",
      from: "fdx",
      read: async (bytes, ids) =>
        (await import("@manent/formats")).readFdx(bytes, { parseXml, ids }),
    },
    {
      extension: ".fountain",
      from: "fountain",
      async read(bytes, ids) {
        const formats = await import("@manent/formats");
        return formats.readFountain(formats.decodeText(bytes), {
          ids,
          titlePage: true,
        });
      },
    },
    { extension: ".fdr", from: "fdr", refuse: FDR_NOT_READABLE },
  ];
}
