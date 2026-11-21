// A script file's bytes as text: its encoding found from a byte order mark, or from the bytes themselves.

/** The largest file a reader takes: 32 MB. */
export const IMPORT_LIMIT_BYTES = 32 * 1024 * 1024;

const MARKS: readonly {
  readonly bytes: readonly number[];
  readonly encoding: string;
}[] = [
  { bytes: [0xef, 0xbb, 0xbf], encoding: "utf-8" },
  { bytes: [0xff, 0xfe], encoding: "utf-16le" },
  { bytes: [0xfe, 0xff], encoding: "utf-16be" },
];
const LINE_END = /\r\n?/g;

const startsWith = (bytes: Uint8Array, mark: readonly number[]): boolean =>
  mark.every((byte, i) => bytes[i] === byte);

function withoutMark(bytes: Uint8Array): string {
  const mark = MARKS.find((candidate) => startsWith(bytes, candidate.bytes));
  if (mark !== undefined)
    return new TextDecoder(mark.encoding, { ignoreBOM: true }).decode(
      bytes.subarray(mark.bytes.length),
    );
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // not UTF-8: the older files' encoding, which decodes any byte
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * The text of a file: after a UTF-8 or UTF-16 byte order mark in its encoding, else as UTF-8 when the bytes
 * are valid UTF-8, else as Windows-1252; CRLF and a lone CR become LF. Never throws: a byte that cannot be
 * decoded becomes U+FFFD.
 */
export function decodeText(bytes: Uint8Array): string {
  return withoutMark(bytes).replace(LINE_END, "\n");
}
