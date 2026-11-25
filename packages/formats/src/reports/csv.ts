// RFC 4180 UTF-8 CSV writer with CRLF line endings.

const NEEDS_QUOTE = new RegExp('[",\\r\\n]');
const DOUBLE_QUOTE = new RegExp('"', "g");

function csvCell(value: string): string {
  if (!NEEDS_QUOTE.test(value)) return value;
  return `"${value.replace(DOUBLE_QUOTE, '""')}"`;
}

/** Formats `headers` followed by `rows` as RFC 4180 CSV with CRLF (`\r\n`) line endings. */
export function writeCsv(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/** Encodes RFC 4180 CRLF CSV as UTF-8 bytes backed by a standalone ArrayBuffer. */
export function writeCsvBytes(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(writeCsv(headers, rows)));
}
