// The files Manent imports, one reader per extension; @manent/formats loads at the first read.
import type { ImportedScript, SourceFormat, XmlParser } from "@manent/formats";
import type { IdSource } from "@manent/schema";

export interface ImportReader {
  readonly extension: string;
  readonly from: SourceFormat;
  /** Loads @manent/formats at its first call; rejects with the reader's FormatError. */
  read(bytes: Uint8Array, ids: IdSource): Promise<ImportedScript>;
}

/** A constant, so the picker and the refusals need no module loaded. */
export const IMPORTABLE_EXTENSIONS: readonly string[] = Object.freeze([
  ".fdx",
  ".fountain",
]);

/** .fdx → readFdx with parseXml; .fountain → readFountain after decodeText. The app passes domXml; apps/web's unit tests pass bunXml. */
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
  ];
}
